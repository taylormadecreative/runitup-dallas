import Foundation
import WatchConnectivity

// transferUserInfo queues FIFO and survives app termination and reboot, so a
// phone-free run is delivered whenever the phone next becomes available.
// The watch never talks to Supabase — the phone owns all saving.
final class PhoneSync: NSObject, WCSessionDelegate {
    static let shared = PhoneSync()

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    // The watch app being alive and idle is proof no workout is running —
    // clears a stale "active" left by a crash, force-quit, or dead battery.
    func clearStaleWorkoutFlag() {
        pushContext(workoutActive: false)
    }

    func send(_ run: FinishedRun) {
        guard WCSession.isSupported() else { return }
        var info: [String: Any] = [
            "type": "run",
            "clientRunId": run.clientRunId,
            "startedAt": Self.iso.string(from: run.startedAt),
            "endedAt": Self.iso.string(from: run.endedAt),
            "durationSeconds": run.durationSeconds,
            "distanceMiles": run.distanceMiles,
            "points": run.points
        ]
        if let p = run.paceSecPerMile { info["paceSecPerMile"] = p }
        if let g = run.goalMiles { info["goalMiles"] = g }
        if let h = run.goalHit { info["goalHit"] = h }
        if let hr = run.avgHeartRate { info["avgHeartRate"] = hr }
        let s = WCSession.default
        // Two independent delivery paths. transferUserInfo is the queue that
        // holds a backlog of runs; applicationContext always carries the most
        // recent one and is replayable from `receivedApplicationContext` on the
        // phone's next launch. Saves dedupe on clientRunId, so a run arriving
        // by both routes is harmless — and neither route alone can lose it.
        s.transferUserInfo(info)
        lastRunInfo = info
        pushContext(workoutActive: false)
    }

    // Persisted: an undelivered run must survive a relaunch and must not be
    // erased by the next run's context push.
    private var lastRunInfo: [String: Any]? {
        get { UserDefaults.standard.dictionary(forKey: "riu_last_run") }
        set {
            if let v = newValue { UserDefaults.standard.set(v, forKey: "riu_last_run") }
            else { UserDefaults.standard.removeObject(forKey: "riu_last_run") }
        }
    }

    func setWorkoutActive(_ active: Bool) {
        pushContext(workoutActive: active)
    }

    private func pushContext(workoutActive: Bool) {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated else { return }
        var ctx: [String: Any] = ["watchWorkoutActive": workoutActive]
        if let run = lastRunInfo { ctx["lastRun"] = run }
        // A repeated identical context is dropped by WatchConnectivity; the
        // stamp guarantees every push is seen as new.
        ctx["stamp"] = Date().timeIntervalSince1970
        try? WCSession.default.updateApplicationContext(ctx)
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}
}
