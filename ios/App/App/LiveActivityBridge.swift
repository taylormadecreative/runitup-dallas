import Foundation

#if canImport(ActivityKit)
import ActivityKit

// App-side Live Activity lifecycle. The widget extension renders; this starts,
// updates, and ends the activity from RunEngine plugin calls.
@available(iOS 16.2, *)
final class LiveActivityBridge {
    static let shared = LiveActivityBridge()
    private var activity: Activity<RunActivityAttributes>?

    // A previous process may have died mid-run and left an activity pinned to
    // the lock screen — clear strays before starting fresh (also run at launch).
    func endStrays() {
        for stray in Activity<RunActivityAttributes>.activities {
            Task { await stray.end(nil, dismissalPolicy: .immediate) }
        }
    }

    func start(state: RunActivityAttributes.ContentState) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        endStrays()
        activity = try? Activity.request(
            attributes: RunActivityAttributes(),
            content: .init(state: state, staleDate: nil)
        )
    }

    func update(state: RunActivityAttributes.ContentState) {
        guard let activity = activity else { return }
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    func end(finalState: RunActivityAttributes.ContentState?) {
        guard let activity = activity else { return }
        self.activity = nil
        Task {
            if let finalState = finalState {
                await activity.end(.init(state: finalState, staleDate: nil), dismissalPolicy: .after(.now + 4))
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
#endif
