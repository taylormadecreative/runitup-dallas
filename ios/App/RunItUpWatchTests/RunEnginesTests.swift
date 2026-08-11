import XCTest
// RunMilestones.swift and AutoPause.swift are compiled directly into this
// logic-test bundle (they import only Foundation), so no app host is needed.

final class RunPhraseTests: XCTestCase {
    func testDuration() {
        XCTAssertEqual(RunPhrase.duration(1180), "nineteen minutes, forty seconds")
        XCTAssertEqual(RunPhrase.duration(65), "one minute, five seconds")
        XCTAssertEqual(RunPhrase.duration(40), "forty seconds")
        XCTAssertEqual(RunPhrase.duration(1200), "twenty minutes")
    }
    func testPace() {
        XCTAssertEqual(RunPhrase.pace(590), "nine fifty")
        XCTAssertEqual(RunPhrase.pace(545), "nine oh five")
        XCTAssertEqual(RunPhrase.pace(600), "ten flat")
        XCTAssertNil(RunPhrase.pace(nil))
        XCTAssertNil(RunPhrase.pace(0))
    }
    func testMiles() {
        XCTAssertEqual(RunPhrase.miles(2), "two miles")
        XCTAssertEqual(RunPhrase.miles(1), "one mile")
        XCTAssertEqual(RunPhrase.miles(0.5), "half a mile")
        XCTAssertEqual(RunPhrase.miles(0.25), "a quarter mile")
        XCTAssertEqual(RunPhrase.miles(2.5), "2.5 miles")
    }
}

final class RunMilestonesTests: XCTestCase {
    func testTwoMileGoalSequence() {
        var m = RunMilestones(goalMiles: 2)
        XCTAssertEqual(m.onSample(miles: 0.4, elapsed: 240), [])
        XCTAssertEqual(m.onSample(miles: 1.01, elapsed: 600), [.mile(1), .halfway])
        XCTAssertEqual(m.onSample(miles: 1.2, elapsed: 700), [])
        XCTAssertEqual(m.onSample(miles: 1.76, elapsed: 1000), [.finalStretch])
        XCTAssertEqual(m.onSample(miles: 2.01, elapsed: 1180), [.mile(2), .goal])
        XCTAssertEqual(m.onSample(miles: 2.3, elapsed: 1400), [])
    }
    func testMileSplitsContinueAfterGoal() {
        var m = RunMilestones(goalMiles: 2)
        _ = m.onSample(miles: 2.01, elapsed: 1180)
        XCTAssertEqual(m.onSample(miles: 3.05, elapsed: 1900), [.mile(3)])
    }
    func testNoGoalGivesSplitsOnly() {
        var m = RunMilestones(goalMiles: nil)
        XCTAssertEqual(m.onSample(miles: 1.02, elapsed: 612), [.mile(1)])
        XCTAssertEqual(m.onSample(miles: 1.9, elapsed: 1100), [])
    }
    func testGpsJumpAnnouncesLatestMileOnly() {
        var m = RunMilestones(goalMiles: nil)
        XCTAssertEqual(m.onSample(miles: 2.1, elapsed: 1200), [.mile(2)])
    }
    func testSmallGoalSkipsFinalStretch() {
        var m = RunMilestones(goalMiles: 0.5)
        XCTAssertEqual(m.onSample(miles: 0.26, elapsed: 150), [.halfway])
        XCTAssertEqual(m.onSample(miles: 0.5, elapsed: 300), [.goal])
    }
    func testSpokenLines() {
        XCTAssertEqual(RunPhrase.speak(.halfway, miles: 1.0, elapsed: 600, goal: 2),
                       "Halfway there. One mile to go.")
        XCTAssertEqual(RunPhrase.speak(.finalStretch, miles: 1.76, elapsed: 1000, goal: 2),
                       "Quarter mile to go. Finish strong.")
        XCTAssertEqual(RunPhrase.speak(.goal, miles: 2.01, elapsed: 1180, goal: 2),
                       "Goal hit. Two miles. Way to run it up.")
        XCTAssertTrue(RunPhrase.speak(.mile(2), miles: 2.0, elapsed: 1180, goal: 2)
                        .hasPrefix("Mile two. Total time nineteen minutes, forty seconds."))
    }
    func testSmallGoalHalfwayPhrase() {
        XCTAssertEqual(RunPhrase.speak(.halfway, miles: 0.26, elapsed: 150, goal: 0.5),
                       "Halfway there. A quarter mile to go.")
    }
    func testFinishSummaryIncludesHeartRate() {
        let s = RunPhrase.finishSummary(miles: 2.0, seconds: 1180, paceSecPerMile: 590,
                                        goalMiles: 2, avgHeartRate: 152)
        XCTAssertEqual(s, "Run finished. Two miles in nineteen minutes, forty seconds. Average pace nine fifty per mile. Average heart rate one hundred fifty-two. Goal complete.")
    }
    func testFinishSummaryWithoutGoalOrHeartRate() {
        let s = RunPhrase.finishSummary(miles: 1.4, seconds: 900, paceSecPerMile: nil,
                                        goalMiles: 2, avgHeartRate: nil)
        XCTAssertEqual(s, "Run finished. 1.4 miles in fifteen minutes.")
    }
}

final class AutoPauseTests: XCTestCase {
    func testPauseAfterSixSecondsStill() {
        var d = AutoPause()
        XCTAssertNil(d.onFix(speedMps: 3.0, accuracyM: 5, t: 0, isPaused: false))
        XCTAssertNil(d.onFix(speedMps: 0.1, accuracyM: 5, t: 10, isPaused: false)) // immunity
        XCTAssertNil(d.onFix(speedMps: 3.0, accuracyM: 5, t: 19, isPaused: false))
        XCTAssertNil(d.onFix(speedMps: 0.2, accuracyM: 5, t: 20, isPaused: false))
        XCTAssertNil(d.onFix(speedMps: 0.2, accuracyM: 5, t: 25, isPaused: false))
        XCTAssertEqual(d.onFix(speedMps: 0.2, accuracyM: 5, t: 26, isPaused: false), .pause)
    }
    func testNoisyFixesIgnored() {
        var d = AutoPause()
        _ = d.onFix(speedMps: 3.0, accuracyM: 5, t: 0, isPaused: false)
        XCTAssertNil(d.onFix(speedMps: 9.0, accuracyM: 40, t: 20, isPaused: true))
        XCTAssertNil(d.onFix(speedMps: -1, accuracyM: 5, t: 21, isPaused: true))
    }
    func testResumeNeedsTwoMovingFixes() {
        var d = AutoPause()
        _ = d.onFix(speedMps: 3.0, accuracyM: 5, t: 0, isPaused: false)
        XCTAssertNil(d.onFix(speedMps: 1.2, accuracyM: 5, t: 30, isPaused: true))
        XCTAssertEqual(d.onFix(speedMps: 1.2, accuracyM: 5, t: 31, isPaused: true), .resume)
    }
    func testShuffleBandIsNeutral() {
        var d = AutoPause()
        _ = d.onFix(speedMps: 3.0, accuracyM: 5, t: 0, isPaused: false)
        _ = d.onFix(speedMps: 3.0, accuracyM: 5, t: 19, isPaused: false)
        let speeds: [Double] = [0.4, 0.5, 0.85, 0.45, 0.7, 0.5, 0.48]
        var fired: AutoPause.Action?
        for (i, s) in speeds.enumerated() {
            if let a = d.onFix(speedMps: s, accuracyM: 5, t: 20 + Double(i), isPaused: false) { fired = a; break }
        }
        XCTAssertEqual(fired, .pause)
    }
}
