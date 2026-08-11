import SwiftUI

struct StartView: View {
    @EnvironmentObject var workout: WorkoutManager
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

                if showCustom {
                    Text(Self.format(custom) + " MI")
                        .font(.system(size: 26, weight: .black))
                        .foregroundStyle(RIU.lime)
                        .focusable()
                        .digitalCrownRotation($custom, from: 0.25, through: 50, by: 0.25,
                                              sensitivity: .medium, isContinuous: false)
                }

                Button {
                    workout.goalMiles = showCustom ? custom : selected
                    Task {
                        await workout.start()
                        PhoneSync.shared.setWorkoutActive(true)
                    }
                } label: {
                    Text("START")
                        .font(.system(size: 17, weight: .black))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(RIU.lime)
                .foregroundStyle(RIU.black)
                .padding(.top, 4)

                if workout.authorizationDenied {
                    Text("Allow Health and Location for Run It UP! to track your runs.")
                        .font(.system(size: 11))
                        .foregroundStyle(RIU.muted)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 4)
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
