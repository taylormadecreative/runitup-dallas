import Foundation
import WatchKit
import AVFoundation

// Haptics always fire — they work with no headphones and never interrupt music.
// Speech only plays when headphones are actually connected, so the watch
// speaker never blares mid-run.
final class CoachFeedback {
    static let shared = CoachFeedback()
    private let synthesizer = AVSpeechSynthesizer()

    private var headphonesConnected: Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains {
            [.bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .headphones].contains($0.portType)
        }
    }

    func play(_ milestone: RunMilestones.Milestone, miles: Double,
              elapsed: TimeInterval, goal: Double?) {
        switch milestone {
        case .mile: WKInterfaceDevice.current().play(.notification)
        case .halfway: WKInterfaceDevice.current().play(.directionUp)
        case .finalStretch: WKInterfaceDevice.current().play(.directionUp)
        case .goal: WKInterfaceDevice.current().play(.success)
        }
        speak(RunPhrase.speak(milestone, miles: miles, elapsed: elapsed, goal: goal))
    }

    func playFinish(_ run: FinishedRun) {
        WKInterfaceDevice.current().play(.stop)
        speak(RunPhrase.finishSummary(
            miles: run.distanceMiles,
            seconds: TimeInterval(run.durationSeconds),
            paceSecPerMile: run.paceSecPerMile.map(Double.init),
            goalMiles: run.goalMiles,
            avgHeartRate: run.avgHeartRate))
    }

    private func speak(_ text: String) {
        guard headphonesConnected, !text.isEmpty else { return }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
        do { try session.setActive(true) } catch { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        synthesizer.speak(utterance)
    }
}
