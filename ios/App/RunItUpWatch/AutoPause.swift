import Foundation

// Mirrors the auto-pause detector in js/run-logic.js so the watch and phone
// agree on when a runner has actually stopped. watchOS does not auto-pause
// third-party workout sessions, so this drives HKWorkoutSession.pause()/resume().
struct AutoPause {
    enum Action { case pause, resume }

    private static let stillMps = 0.6
    private static let moveMps = 1.0
    private static let stillSeconds: TimeInterval = 6
    private static let immunitySeconds: TimeInterval = 15
    private static let maxAccuracyM = 20.0

    private var t0: TimeInterval?
    private var stillSince: TimeInterval?
    private var movingCount = 0

    mutating func onFix(speedMps: Double, accuracyM: Double,
                        t: TimeInterval, isPaused: Bool) -> Action? {
        guard accuracyM <= Self.maxAccuracyM, speedMps >= 0 else { return nil }
        if t0 == nil { t0 = t }

        if isPaused {
            if speedMps >= Self.moveMps {
                movingCount += 1
                if movingCount >= 2 { movingCount = 0; return .resume }
            } else {
                movingCount = 0
            }
            return nil
        }

        guard let start = t0, t - start >= Self.immunitySeconds else { return nil }
        if speedMps < Self.stillMps {
            if stillSince == nil { stillSince = t }
            if let s = stillSince, t - s >= Self.stillSeconds { stillSince = nil; return .pause }
        } else if speedMps >= Self.moveMps {
            stillSince = nil // real movement resets; the 0.6-1.0 shuffle band is neutral
        }
        return nil
    }

    mutating func reset() {
        stillSince = nil
        movingCount = 0
    }
}
