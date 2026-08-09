#if canImport(ActivityKit)
import ActivityKit
import Foundation

// Shared between the App target and the RunItUpWidgets extension —
// both must compile the exact same attributes type for updates to land.
@available(iOS 16.2, *)
struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var miles: Double
        var paceText: String
        var statusText: String     // "LIVE" | "PAUSED" | "AUTO-PAUSED" | "DONE"
        var goalMiles: Double?
        var adjustedStartMs: Double // epoch ms the ticking clock counts from (now - elapsed)
        var frozenElapsed: String?  // non-nil while paused — shown instead of the ticking clock
    }
}
#endif
