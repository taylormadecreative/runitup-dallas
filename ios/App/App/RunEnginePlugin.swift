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
            lm.startUpdatingLocation()
            self.locationManager = lm
            call.resolve()
        }
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.locationManager?.stopUpdatingLocation()
            self.locationManager?.allowsBackgroundLocationUpdates = false
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
            try? session.setActive(true)
            let utterance = AVSpeechUtterance(string: text)
            utterance.voice = Self.bestVoice()
            if let rate = call.getDouble("rate") {
                utterance.rate = Float(rate)
            }
            self.speakCalls[ObjectIdentifier(utterance)] = call
            self.synthesizer.speak(utterance)
        }
    }

    private func finishUtterance(_ utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.speakCalls.removeValue(forKey: ObjectIdentifier(utterance))?.resolve()
            if !self.synthesizer.isSpeaking && self.speakCalls.isEmpty {
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        finishUtterance(utterance)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        finishUtterance(utterance)
    }

    // MARK: - Live Activity (implemented in the Live Activity task; stubs keep the JS surface stable)

    @objc func startActivity(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func updateActivity(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func endActivity(_ call: CAPPluginCall) {
        call.resolve()
    }
}
