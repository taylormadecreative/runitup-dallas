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
        WCSession.default.transferUserInfo(info)
    }

    func setWorkoutActive(_ active: Bool) {
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated else { return }
        try? WCSession.default.updateApplicationContext(["watchWorkoutActive": active])
    }

    func session(_ session: WCSession,
                 activationDidCompleteWith activationState: WCSessionActivationState,
                 error: Error?) {}
}
