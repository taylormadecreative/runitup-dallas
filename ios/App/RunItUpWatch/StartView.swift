import SwiftUI

struct StartView: View {
    @EnvironmentObject var workout: WorkoutManager
    @AppStorage("riu_last_goal") private var lastGoal: Double = -1
    @State private var selected: Double?      // nil = just run
    @State private var custom: Double = 2.0
    @State private var showCustom = false

    private let presets: [Double] = [1, 2, 3, 5]

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("GOAL")
                    .font(.system(size: 11, weight: .heavy))
                    .foregroundStyle(RIU.muted)
                    .kerning(1.6)

                chip("JUST RUN", value: nil)
                ForEach(presets, id: \.self) { p in
                    chip("\(Int(p)) MI", value: p)
                }
                chip("CUSTOM", value: -1)
                    .onAppear {
                        // Restore the last goal so repeat runners just hit START.
                        guard lastGoal >= 0, selected == nil, !showCustom else { return }
                        if [1.0, 2.0, 3.0, 5.0].contains(lastGoal) { selected = lastGoal }
                        else if lastGoal > 0 { custom = lastGoal; showCustom = true }
                    }

                if showCustom {
                    Text(Self.format(custom) + " MI")
                        .font(.system(size: 26, weight: .black))
                        .foregroundStyle(RIU.lime)
                        .focusable()
                        .digitalCrownRotation($custom, from: 0.25, through: 50, by: 0.25,
                                              sensitivity: .medium, isContinuous: false)
                }

                if workout.authorizationDenied {
                    Text("Allow Health and Location for Run It UP! to track your runs.")
                        .font(.system(size: 11))
                        .foregroundStyle(RIU.muted)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 4)
        }
        // START is pinned so a runner never has to scroll past six chips to
        // begin — it stays on screen whatever the watch size.
        .safeAreaInset(edge: .bottom) {
            Button {
                workout.goalMiles = showCustom ? custom : selected
                Task {
                    await workout.start()
                    // Only tell the phone a workout is live if one actually is.
                    if workout.state == .running { PhoneSync.shared.setWorkoutActive(true) }
                }
            } label: {
                Text(workout.state == .starting ? "STARTING..." : "START")
                    .font(.system(size: 17, weight: .black))
                    .frame(maxWidth: .infinity)
                    .foregroundStyle(RIU.black)
            }
            .buttonStyle(.borderedProminent)
            .tint(RIU.lime)
            .disabled(workout.state == .starting)
            .padding(.horizontal, 4)
            .padding(.bottom, 2)
        }
        .containerBackground(RIU.black, for: .navigation)
        .navigationTitle("RUN IT UP!")
        .task { await workout.requestAuthorization() }
    }

    static func format(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.2f", v)
            .replacingOccurrences(of: "0$", with: "", options: .regularExpression)
    }

    @ViewBuilder
    private func chip(_ label: String, value: Double?) -> some View {
        let isCustomChip = (value == -1)
        let active = isCustomChip ? showCustom : (!showCustom && selected == value)
        Button {
            if isCustomChip {
                showCustom = true
                selected = nil
            } else {
                showCustom = false
                selected = value
                lastGoal = value ?? 0
            }
        } label: {
            Text(label)
                .font(.system(size: 14, weight: .heavy))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
                // .bordered dims its tint; prominent + explicit fill keeps the
                // selected chip true lime instead of olive.
                .foregroundStyle(active ? RIU.black : .white)
        }
        .buttonStyle(.borderedProminent)
        .tint(active ? RIU.lime : RIU.card)
    }
}
