import ActivityKit
import WidgetKit
import SwiftUI

// Brand: black #0A0A0A / lime #BFFF00 only. SF system font (Big Shoulders
// webfonts are not embedded in the extension by design).
private let riuBlack = Color(red: 10/255, green: 10/255, blue: 10/255)
private let riuLime = Color(red: 191/255, green: 255/255, blue: 0/255)
private let riuMuted = Color.white.opacity(0.55)

struct RunActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            LockScreenRunView(state: context.state, isStale: context.isStale)
                .activityBackgroundTint(riuBlack)
                .activitySystemActionForegroundColor(riuLime)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("RUN IT UP!")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(riuLime)
                        Text(context.state.statusText)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(riuMuted)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    MilesText(miles: context.state.miles)
                        .font(.system(size: 26, weight: .black))
                        .foregroundColor(riuLime)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        ElapsedText(state: context.state)
                            .font(.system(size: 15, weight: .bold).monospacedDigit())
                            .foregroundColor(.white)
                        Spacer()
                        Text(context.state.paceText + " PACE")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(riuMuted)
                    }
                    if let goal = context.state.goalMiles, goal > 0 {
                        GoalBar(miles: context.state.miles, goal: goal)
                    }
                }
            } compactLeading: {
                Image(systemName: "figure.run")
                    .foregroundColor(riuLime)
            } compactTrailing: {
                MilesText(miles: context.state.miles)
                    .font(.system(size: 14, weight: .black).monospacedDigit())
                    .foregroundColor(riuLime)
            } minimal: {
                Image(systemName: "figure.run")
                    .foregroundColor(riuLime)
            }
        }
    }
}

private struct MilesText: View {
    let miles: Double
    var body: some View {
        Text(String(format: "%.2f", miles))
    }
}

// Ticks natively while running; frozen string while paused — no pushes needed.
// Text(timerInterval:) renders the compact ticking clock ("15:12"), unlike
// Text(_:style:.timer) which falls back to "15 minutes" in wide layouts.
private struct ElapsedText: View {
    let state: RunActivityAttributes.ContentState
    var body: some View {
        if let frozen = state.frozenElapsed {
            Text(frozen)
        } else {
            Text(
                timerInterval: Date(timeIntervalSince1970: state.adjustedStartMs / 1000)...Date.distantFuture,
                countsDown: false
            )
        }
    }
}

private struct GoalBar: View {
    let miles: Double
    let goal: Double
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            ProgressView(value: min(1.0, miles / goal))
                .progressViewStyle(.linear)
                .tint(riuLime)
            Text(String(format: "GOAL %.4g MI", goal))
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(riuMuted)
        }
    }
}

private struct LockScreenRunView: View {
    let state: RunActivityAttributes.ContentState
    var isStale: Bool = false
    // Stale = the app stopped updating (killed / crashed) — stop claiming LIVE
    // and freeze the natively-ticking clock so the lock screen can't lie.
    private var statusLabel: String { isStale ? "OPEN APP TO RESUME" : state.statusText }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("RUN IT UP!")
                    .font(.system(size: 12, weight: .black))
                    .foregroundColor(riuLime)
                    .kerning(1.5)
                Spacer()
                HStack(spacing: 5) {
                    if state.statusText == "LIVE" && !isStale {
                        Circle().fill(riuLime).frame(width: 7, height: 7)
                    }
                    Text(statusLabel)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundColor(state.statusText == "LIVE" && !isStale ? riuLime : riuMuted)
                        .kerning(1.2)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                MilesText(miles: state.miles)
                    .font(.system(size: 44, weight: .black).monospacedDigit())
                    .foregroundColor(riuLime)
                Text("MI")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundColor(riuMuted)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    if isStale {
                        Text("--:--")
                            .font(.system(size: 20, weight: .heavy).monospacedDigit())
                            .foregroundColor(riuMuted)
                    } else {
                        ElapsedText(state: state)
                            .font(.system(size: 20, weight: .heavy).monospacedDigit())
                            .foregroundColor(.white)
                            .multilineTextAlignment(.trailing)
                    }
                    Text(state.paceText + " PACE")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(riuMuted)
                }
            }
            if let goal = state.goalMiles, goal > 0 {
                GoalBar(miles: state.miles, goal: goal)
            }
        }
        .padding(14)
        .opacity(isStale ? 0.7 : 1)
    }
}
