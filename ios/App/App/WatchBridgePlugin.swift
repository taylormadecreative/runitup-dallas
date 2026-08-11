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

    // Runs are persisted the moment they arrive: iOS can wake this app in the
    // background purely to deliver one, with no webview and no JS listener, and
    // WatchConnectivity never resends. An in-memory buffer would die with that
    // process. Entries are cleared only once JS has been handed them.
    private static let pendingKey = "riu_watch_pending_runs"
    private var listenerReady = false

    private var pendingRuns: [[String: Any]] {
        get { UserDefaults.standard.array(forKey: Self.pendingKey) as? [[String: Any]] ?? [] }
        set { UserDefaults.standard.set(Array(newValue.suffix(20)), forKey: Self.pendingKey) }
    }

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
            let runs = self.pendingRuns
            self.pendingRuns = []
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
        guard info["type"] as? String == "run",
              let id = info["clientRunId"] as? String else { return }
        if listenerReady {
            notifyListeners("watchRun", data: info)
            return
        }
        var all = pendingRuns
        all.removeAll { ($0["clientRunId"] as? String) == id }
        all.append(info)
        pendingRuns = all
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
        // The context persists across launches, so the same run would otherwise
        // be re-delivered forever. Forward each client id from this path once.
        guard let run = ctx["lastRun"] as? [String: Any],
              let id = run["clientRunId"] as? String else { return }
        let seenKey = "riu_watch_context_seen"
        var seen = UserDefaults.standard.stringArray(forKey: seenKey) ?? []
        guard !seen.contains(id) else { return }
        seen.append(id)
        UserDefaults.standard.set(Array(seen.suffix(50)), forKey: seenKey)
        deliver(run)
    }

    public func session(_ session: WCSession,
                        activationDidCompleteWith activationState: WCSessionActivationState,
                        error: Error?) {}

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate() // re-activate for the newly paired watch
    }
}
