import Foundation
import Capacitor
import CoreLocation
import AVFoundation

// In-house engine for live runs: background-safe GPS, coach speech that ducks
// music, and the Live Activity lifecycle. Registered app-locally from
// RIUViewController — not an npm plugin.
@objc(RunEnginePlugin)
public class RunEnginePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "RunEnginePlugin"
    public let jsName = "RunEngine"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak",         returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endActivity",   returnType: CAPPluginReturnPromise)
    ]

    private var locationManager: CLLocationManager?
    private let synthesizer = AVSpeechSynthesizer()
    private var speakCalls: [ObjectIdentifier: CAPPluginCall] = [:]

    public override func load() {
        synthesizer.delegate = self
        if #available(iOS 16.2, *) {
            LiveActivityBridge.shared.endStrays() // clear anything a killed run left on the lock screen
        }
        // A phone call / Siri / alarm pauses AVSpeechSynthesizer and it never
        // resumes on its own — cancel outright so every queued utterance drains
        // through didCancel (resolving its call) and the next cue starts clean.
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let self = self else { return }
            let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            if raw == AVAudioSession.InterruptionType.began.rawValue {
                self.synthesizer.stopSpeaking(at: .immediate)
            }
        }
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] _ in
            self?.drainSpeakCalls()
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func drainSpeakCalls() {
        for (_, call) in speakCalls { call.resolve() }
        speakCalls.removeAll()
    }

    // MARK: - Background GPS

    @objc func startTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let lm = self.locationManager ?? CLLocationManager()
            lm.delegate = self
            lm.desiredAccuracy = kCLLocationAccuracyBest
            lm.activityType = .fitness
            lm.distanceFilter = kCLDistanceFilterNone
            lm.allowsBackgroundLocationUpdates = true
            lm.pausesLocationUpdatesAutomatically = false
            lm.showsBackgroundLocationIndicator = true
            if lm.authorizationStatus == .notDetermined {
                lm.requestWhenInUseAuthorization()
            }
            // Precise Location off = 1-3 km fixes the JS pipeline rightly drops,
            // which would read as a run stuck at 0.00 — ask for temporary full
            // accuracy and tell JS if the user declines.
            if lm.accuracyAuthorization == .reducedAccuracy {
                lm.requestTemporaryFullAccuracyAuthorization(withPurposeKey: "RunTracking") { [weak self] _ in
                    DispatchQueue.main.async {
                        if self?.locationManager?.accuracyAuthorization == .reducedAccuracy {
                            self?.notifyListeners("locationError", data: [
                                "message": "precise-location-off",
                                "code": "reducedAccuracy"
                            ])
                        }
                    }
                }
            }
            lm.startUpdatingLocation()
            self.locationManager = lm
            call.resolve()
        }
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.locationManager?.stopUpdatingLocation()
            self.locationManager?.allowsBackgroundLocationUpdates = false
            // End of run: never strand a queued utterance's pending call
            self.synthesizer.stopSpeaking(at: .word)
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for loc in locations {
            notifyListeners("location", data: [
                "lat": loc.coordinate.latitude,
                "lng": loc.coordinate.longitude,
                "accuracy": loc.horizontalAccuracy,
                "speedMps": loc.speed,
                "timestamp": loc.timestamp.timeIntervalSince1970 * 1000.0
            ])
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        notifyListeners("locationError", data: ["message": error.localizedDescription])
    }

    // MARK: - Coach speech (ducks music, resolves when the utterance finishes)

    private static func bestVoice() -> AVSpeechSynthesisVoice? {
        let en = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("en") }
        let ranked = en.sorted { $0.quality.rawValue > $1.quality.rawValue }
        return ranked.first(where: { $0.language == "en-US" }) ?? ranked.first ?? AVSpeechSynthesisVoice(language: "en-US")
    }

    @objc func speak(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), !text.isEmpty else { call.resolve(); return }
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers, .mixWithOthers])
            do {
                try session.setActive(true)
            } catch {
                // Mid-call etc. — speech is best-effort; never block the JS side.
                CAPLog.print("RunEngine: audio session activate failed: \(error)")
                call.resolve()
                return
            }
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = Self.bestVoice()
            if let rate = call.getDouble("rate") {
                utterance.rate = Float(rate)
            }
            let key = ObjectIdentifier(utterance)
            self.speakCalls[key] = call
            self.synthesizer.speak(utterance)
            // Watchdog: a stranded utterance (interruption edge cases) must
            // never leave the countdown awaiting forever. Generous budget:
            // ~12 chars/sec speech plus slack.
            let budget = 4.0 + Double(text.count) / 8.0
            DispatchQueue.main.asyncAfter(deadline: .now() + budget) { [weak self] in
                self?.speakCalls.removeValue(forKey: key)?.resolve()
            }
        }
    }

    private func finishUtterance(_ utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.speakCalls.removeValue(forKey: ObjectIdentifier(utterance))?.resolve()
            self.deactivateSessionWhenIdle(attempt: 0)
        }
    }

    // Deactivating inside the didFinish hop commonly throws isBusy (560030580)
    // while the synthesizer's I/O tears down — and .duckOthers keeps the user's
    // music ducked until deactivation SUCCEEDS. Delay, re-check, retry.
    private func deactivateSessionWhenIdle(attempt: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self else { return }
            guard !self.synthesizer.isSpeaking && self.speakCalls.isEmpty else { return }
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                CAPLog.print("RunEngine: audio session deactivate failed (attempt \(attempt)): \(error)")
                if attempt < 3 { self.deactivateSessionWhenIdle(attempt: attempt + 1) }
            }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finishUtterance(utterance)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finishUtterance(utterance)
    }

    // MARK: - Live Activity

    @available(iOS 16.2, *)
    private static func contentState(from call: CAPPluginCall) -> RunActivityAttributes.ContentState {
        return RunActivityAttributes.ContentState(
            miles: call.getDouble("miles") ?? 0,
            paceText: call.getString("paceText") ?? "--'--\"",
            statusText: call.getString("statusText") ?? "LIVE",
            goalMiles: call.getDouble("goalMiles"),
            adjustedStartMs: call.getDouble("adjustedStartMs") ?? Date().timeIntervalSince1970 * 1000.0,
            frozenElapsed: call.getString("frozenElapsed")
        )
    }

    @objc func startActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            LiveActivityBridge.shared.start(state: Self.contentState(from: call))
        }
        call.resolve()
    }

    @objc func updateActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            LiveActivityBridge.shared.update(state: Self.contentState(from: call))
        }
        call.resolve()
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            // A call with real content shows a 4-second final card; empty = dismiss now.
            let hasFinal = call.getDouble("miles") != nil
            LiveActivityBridge.shared.end(finalState: hasFinal ? Self.contentState(from: call) : nil)
        }
        call.resolve()
    }
}
