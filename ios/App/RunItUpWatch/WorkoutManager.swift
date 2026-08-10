import Foundation
import HealthKit
import CoreLocation

struct FinishedRun {
    let clientRunId: String
    let startedAt: Date
    let endedAt: Date
    let durationSeconds: Int
    let distanceMiles: Double
    let paceSecPerMile: Int?
    let goalMiles: Double?
    let goalHit: Bool?
    let avgHeartRate: Int?
    let points: [[String: Double]]
}

// Owns the HealthKit workout: Apple's engine supplies distance (GPS + wrist
// motion fusion), heart rate, calories, the elapsed clock, and the background
// execution that keeps a run alive with the wrist down.
@MainActor
final class WorkoutManager: NSObject, ObservableObject {
    enum State { case idle, running, paused, autopaused, ended }

    @Published private(set) var state: State = .idle
    @Published private(set) var miles: Double = 0
    @Published private(set) var elapsed: TimeInterval = 0
    @Published private(set) var paceSecPerMile: Double?
    @Published private(set) var heartRate: Int?
    @Published private(set) var authorizationDenied = false

    var goalMiles: Double?
    private(set) var clientRunId = UUID().uuidString
    var onMilestones: (([RunMilestones.Milestone]) -> Void)?
    var onFinished: ((FinishedRun) -> Void)?

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var routeBuilder: HKWorkoutRouteBuilder?
    private let locationManager = CLLocationManager()

    private var milestones = RunMilestones(goalMiles: nil)
    private var autoPause = AutoPause()
    private var startedAt = Date()
    private var points: [[String: Double]] = []
    private var hrSamples: [Int] = []
    private var ticker: Timer?
    private static let metersPerMile = 1609.344

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBest
        locationManager.activityType = .fitness
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { authorizationDenied = true; return }
        let share: Set = [HKQuantityType.workoutType(), HKSeriesType.workoutRoute()]
        let read: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning)
        ]
        do {
            try await store.requestAuthorization(toShare: share, read: read)
            authorizationDenied = store.authorizationStatus(for: HKQuantityType.workoutType()) == .sharingDenied
        } catch {
            authorizationDenied = true
        }
        locationManager.requestWhenInUseAuthorization()
    }

    func start() async {
        guard state == .idle || state == .ended else { return }
        clientRunId = UUID().uuidString
        milestones = RunMilestones(goalMiles: goalMiles)
        autoPause = AutoPause()
        points = []; hrSamples = []
        miles = 0; elapsed = 0; paceSecPerMile = nil; heartRate = nil

        let config = HKWorkoutConfiguration()
        config.activityType = .running
        config.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            routeBuilder = HKWorkoutRouteBuilder(healthStore: store, device: nil)

            startedAt = Date()
            s.startActivity(with: startedAt)
            try await b.beginCollection(at: startedAt)
            state = .running
            locationManager.startUpdatingLocation()
            startTicker()
        } catch {
            state = .idle
            authorizationDenied = true
        }
    }

    func togglePause() {
        switch state {
        case .running:
            session?.pause()
            state = .paused          // manual pause is sticky — auto-resume never overrides it
        case .paused, .autopaused:
            session?.resume()
            autoPause.reset()
            state = .running
        default:
            break
        }
    }

    func end() {
        guard state != .idle, state != .ended else { return }
        locationManager.stopUpdatingLocation()
        ticker?.invalidate(); ticker = nil
        session?.end()
    }

    private func startTicker() {
        ticker?.invalidate()
        ticker = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refreshElapsed() }
        }
    }

    private func refreshElapsed() {
        guard let b = builder else { return }
        elapsed = b.elapsedTime
        paceSecPerMile = miles > 0.01 ? elapsed / miles : nil
    }

    private func applyAutoPause(_ action: AutoPause.Action) {
        switch action {
        case .pause where state == .running:
            session?.pause()
            state = .autopaused
        case .resume where state == .autopaused:
            session?.resume()
            state = .running
        default:
            break
        }
    }

    fileprivate func finishAndEmit() {
        guard let b = builder else { return }
        let end = Date()
        b.endCollection(withEnd: end) { [weak self] _, _ in
            b.finishWorkout { workout, _ in
                Task { @MainActor in
                    guard let self else { return }
                    if let w = workout {
                        self.routeBuilder?.finishRoute(with: w, metadata: nil) { _, _ in }
                    }
                    self.emitFinished(endedAt: end)
                }
            }
        }
    }

    private func emitFinished(endedAt: Date) {
        guard state != .ended else { return }
        state = .ended
        let seconds = max(0, elapsed)
        let avgHR = hrSamples.isEmpty
            ? nil
            : Int((Double(hrSamples.reduce(0, +)) / Double(hrSamples.count)).rounded())
        let run = FinishedRun(
            clientRunId: clientRunId,
            startedAt: startedAt,
            endedAt: endedAt,
            durationSeconds: Int(seconds.rounded()),
            distanceMiles: (miles * 100).rounded() / 100,
            paceSecPerMile: miles > 0.01 ? Int((seconds / miles).rounded()) : nil,
            goalMiles: goalMiles,
            goalHit: goalMiles.map { miles >= $0 },
            avgHeartRate: avgHR,
            points: Self.thin(points, max: 400)
        )
        onFinished?(run)
    }

    // WCSession userInfo payloads must stay well under ~64 KB.
    static func thin(_ pts: [[String: Double]], max: Int) -> [[String: Double]] {
        guard pts.count > max else { return pts }
        let step = Int((Double(pts.count) / Double(max)).rounded(.up))
        return pts.enumerated().compactMap { $0.offset % step == 0 ? $0.element : nil }
    }
}

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState,
                                    date: Date) {
        if toState == .ended {
            Task { @MainActor in self.finishAndEmit() }
        }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in self.finishAndEmit() }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                    didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for type in collectedTypes {
            guard let q = type as? HKQuantityType,
                  let stats = workoutBuilder.statistics(for: q) else { continue }
            Task { @MainActor in self.apply(q, stats) }
        }
    }

    @MainActor
    private func apply(_ type: HKQuantityType, _ stats: HKStatistics) {
        if type == HKQuantityType(.distanceWalkingRunning) {
            let meters = stats.sumQuantity()?.doubleValue(for: .meter()) ?? 0
            miles = meters / Self.metersPerMile
            refreshElapsed()
            let fired = milestones.onSample(miles: miles, elapsed: elapsed)
            if !fired.isEmpty { onMilestones?(fired) }
        } else if type == HKQuantityType(.heartRate) {
            let unit = HKUnit.count().unitDivided(by: .minute())
            if let bpm = stats.mostRecentQuantity()?.doubleValue(for: unit) {
                let rounded = Int(bpm.rounded())
                heartRate = rounded
                hrSamples.append(rounded)
            }
        }
    }
}

extension WorkoutManager: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager,
                                     didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            let usable = locations.filter { $0.horizontalAccuracy > 0 && $0.horizontalAccuracy <= 50 }
            guard !usable.isEmpty else { return }
            self.routeBuilder?.insertRouteData(usable) { _, _ in }
            for loc in usable {
                self.points.append([
                    "lat": loc.coordinate.latitude,
                    "lng": loc.coordinate.longitude,
                    "time": loc.timestamp.timeIntervalSince1970 * 1000
                ])
                if let action = self.autoPause.onFix(
                    speedMps: loc.speed,
                    accuracyM: loc.horizontalAccuracy,
                    t: loc.timestamp.timeIntervalSince1970,
                    isPaused: self.state == .autopaused
                ) {
                    self.applyAutoPause(action)
                }
            }
        }
    }
}
