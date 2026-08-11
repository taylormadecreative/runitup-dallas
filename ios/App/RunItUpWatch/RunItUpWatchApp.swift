import SwiftUI

@main
struct RunItUpWatchApp: App {
    @StateObject private var workout = WorkoutManager()
    @State private var finished: FinishedRun?

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                Group {
                    if let run = finished {
                        SummaryView(run: run) { finished = nil }
                    } else if workout.state == .idle || workout.state == .ended {
                        StartView()
                    } else {
                        RunView()
                    }
                }
            }
            .environmentObject(workout)
            .onAppear {
                PhoneSync.shared.activate()
                workout.onMilestones = { [weak workout] fired in
                    guard let workout else { return }
                    for m in fired {
                        CoachFeedback.shared.play(m, miles: workout.miles,
                                                  elapsed: workout.elapsed,
                                                  goal: workout.goalMiles)
                    }
                }
                workout.onFinished = { run in
                    CoachFeedback.shared.playFinish(run)
                    PhoneSync.shared.send(run)
                    PhoneSync.shared.setWorkoutActive(false)
                    finished = run
                }
            }
        }
    }
}

enum RIU {
    static let lime = Color(red: 191/255, green: 255/255, blue: 0/255)
    static let black = Color(red: 10/255, green: 10/255, blue: 10/255)
    static let card = Color(red: 26/255, green: 26/255, blue: 26/255)
    static let track = Color(red: 37/255, green: 37/255, blue: 37/255)
    static let muted = Color.white.opacity(0.55)
}
