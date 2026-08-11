import SwiftUI

struct SummaryView: View {
    let run: FinishedRun
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: 4) {
                Text("RUN LOGGED")
                    .font(.system(size: 15, weight: .black))
                    .foregroundStyle(RIU.lime)

                if run.goalHit == true, let g = run.goalMiles {
                    Text("GOAL HIT — \(StartView.format(g)) MI")
                        .font(.system(size: 10, weight: .heavy))
                        .foregroundStyle(.white)
                }

                Text(String(format: "%.2f", run.distanceMiles))
                    .font(.system(size: 40, weight: .black).monospacedDigit())
                    .foregroundStyle(RIU.lime)
                Text("MILES")
                    .font(.system(size: 9, weight: .heavy))
                    .kerning(1.2)
                    .foregroundStyle(RIU.muted)

                HStack {
                    cell(RunView.clock(TimeInterval(run.durationSeconds)), "TIME")
                    cell(RunView.paceLabel(run.paceSecPerMile.map(Double.init)), "PACE")
                    cell(run.avgHeartRate.map(String.init) ?? "--", "AVG BPM")
                }
                .padding(.top, 2)

                Text("Syncing to your phone")
                    .font(.system(size: 10))
                    .foregroundStyle(RIU.muted)
                    .padding(.top, 2)

                Button("DONE", action: onDone)
                    .font(.system(size: 14, weight: .heavy))
                    .buttonStyle(.borderedProminent)
                    .tint(RIU.lime)
                    .foregroundStyle(RIU.black)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 4)
        }
        .containerBackground(RIU.black, for: .navigation)
    }

    @ViewBuilder
    private func cell(_ v: String, _ l: String) -> some View {
        VStack(spacing: 0) {
            Text(v)
                .font(.system(size: 14, weight: .heavy).monospacedDigit())
                .foregroundStyle(.white)
            Text(l)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(RIU.muted)
        }
        .frame(maxWidth: .infinity)
    }
}
