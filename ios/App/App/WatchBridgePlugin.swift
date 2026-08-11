import Foundation
import Capacitor
import WatchConnectivity

// Receives finished runs from the Apple Watch and forwards them to the web
// layer, which owns every Supabase write. Runs that arrive before JS attaches
// its listener are buffered, so a handoff is never dropped on a cold launch.
@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchBridgePlugin"
    public let jsName = "WatchBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "flush", returnType: CAPPluginReturnPromise)
    ]

    private var pending: [[String: Any]] = []
    private var listenerReady = false

    public override func load() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    @objc func flush(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.listenerReady = true
            // A context that arrived while the app was closed is not replayed
            // through the delegate — read it directly on every flush.
            if let ctx = WCSession.isSupported() ? WCSession.default.receivedApplicationContext : nil {
                self.deliverContext(ctx)
            }
            let runs = self.pending
            self.pending = []
            for run in runs { self.notifyListeners("watchRun", data: run) }
            let s = WCSession.isSupported() ? WCSession.default : nil
            call.resolve([
                "delivered": runs.count,
                "paired": s?.isPaired ?? false,
                "watchAppInstalled": s?.isWatchAppInstalled ?? false
            ])
        }
    }

    private func deliver(_ info: [String: Any]) {
        guard info["type"] as? String == "run" else { return }
        if listenerReady {
            notifyListeners("watchRun", data: info)
        } else {
            pending.append(info)
        }
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        DispatchQueue.main.async { self.deliver(userInfo) }
    }

    public func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        DispatchQueue.main.async { self.deliverContext(applicationContext) }
    }

    // The context carries live workout state and a copy of the most recent
    // finished run (the second delivery path alongside transferUserInfo).
    private func deliverContext(_ ctx: [String: Any]) {
        if let active = ctx["watchWorkoutActive"] as? Bool {
            notifyListeners("watchWorkoutState", data: ["active": active])
        }
        if let run = ctx["lastRun"] as? [String: Any] { deliver(run) }
    }

    public func session(_ session: WCSession,
                        activationDidCompleteWith activationState: WCSessionActivationState,
                        error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate() // re-activate for the newly paired watch
    }
}
