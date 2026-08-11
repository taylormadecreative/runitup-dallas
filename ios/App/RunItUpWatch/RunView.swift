import SwiftUI

struct RunView: View {
    @EnvironmentObject var workout: WorkoutManager

    var body: some View {
        VStack(spacing: 4) {
            if workout.state == .autopaused || workout.state == .paused {
                Text(workout.state == .autopaused ? "AUTO-PAUSED" : "PAUSED")
                    .font(.system(size: 10, weight: .heavy))
                    .kerning(1.4)
                    .foregroundStyle(RIU.lime)
            }

            ZStack {
                if let goal = workout.goalMiles, goal > 0 {
                    Circle().stroke(RIU.track, lineWidth: 7)
                    Circle()
                        .trim(from: 0, to: min(1, workout.miles / goal))
                        .stroke(RIU.lime, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.easeOut(duration: 0.5), value: workout.miles)
                }
                VStack(spacing: 0) {
                    Text(String(format: "%.2f", workout.miles))
                        .font(.system(size: 34, weight: .black).monospacedDigit())
                        .foregroundStyle(RIU.lime)
                    Text("MILES")
                        .font(.system(size: 9, weight: .heavy))
                        .kerning(1.2)
                        .foregroundStyle(RIU.muted)
                }
            }
            .frame(height: 92)

            HStack {
                stat(Self.clock(workout.elapsed), "TIME")
                stat(Self.paceLabel(workout.paceSecPerMile), "PACE")
                stat(workout.heartRate.map(String.init) ?? "--", "BPM")
            }

            HStack(spacing: 6) {
                Button {
                    workout.togglePause()
                } label: {
                    Text(workout.state == .running ? "PAUSE" : "RESUME")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(.white) // .bordered dims its label to near-invisible on black
                }
                .buttonStyle(.borderedProminent)
                .tint(RIU.card)
                Button("STOP") { workout.end() }
                    .font(.system(size: 13, weight: .heavy))
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
            }
        }
        .padding(.horizontal, 4)
        .containerBackground(RIU.black, for: .navigation)
    }

    @ViewBuilder
    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.system(size: 15, weight: .heavy).monospacedDigit())
                .foregroundStyle(.white)
            Text(label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(RIU.muted)
        }
        .frame(maxWidth: .infinity)
    }

    static func clock(_ t: TimeInterval) -> String {
        let total = Int(t)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    static func paceLabel(_ secPerMile: Double?) -> String {
        guard let p = secPerMile, p.isFinite, p > 0 else { return "--'--\"" }
        return String(format: "%d'%02d\"", Int(p / 60), Int(p.truncatingRemainder(dividingBy: 60)))
    }
}
