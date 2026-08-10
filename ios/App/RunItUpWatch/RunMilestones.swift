import Foundation

// Mirrors the milestone engine in js/run-logic.js so the watch and the phone
// announce the same things at the same points. Pure and deterministic —
// elapsed time always arrives as an argument.
struct RunMilestones {
    enum Milestone: Equatable { case mile(Int), halfway, finalStretch, goal }

    private let goal: Double?
    private var milesAnnounced = 0
    private var halfwayDone = false
    private var finalDone = false
    private var goalDone = false

    init(goalMiles: Double?) {
        if let g = goalMiles, g > 0, g.isFinite { goal = g } else { goal = nil }
    }

    mutating func onSample(miles: Double, elapsed: TimeInterval) -> [Milestone] {
        var out: [Milestone] = []

        // Mile splits keep coaching past the goal; only the goal/halfway/final are one-shot.
        let whole = Int((miles + 1e-9).rounded(.down))
        if whole >= 1 && whole > milesAnnounced {
            out.append(.mile(whole)) // only the latest mile — no backlog spam after a GPS jump
            milesAnnounced = whole
        }

        guard let g = goal else { return out }
        let goalFires = miles >= g && !goalDone
        if !goalFires && !goalDone {
            if !halfwayDone && miles >= g / 2 { halfwayDone = true; out.append(.halfway) }
            if !finalDone && g >= 0.75 && miles >= g - 0.25 { finalDone = true; out.append(.finalStretch) }
        }
        if goalFires {
            goalDone = true
            halfwayDone = true
            finalDone = true
            out.append(.goal)
        }
        return out
    }
}

enum RunPhrase {
    private static let ones = ["zero", "one", "two", "three", "four", "five", "six", "seven",
                               "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
                               "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    private static let tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
                               "eighty", "ninety"]

    static func words(_ n: Int) -> String {
        if n < 0 { return String(n) }
        if n < 20 { return ones[n] }
        if n < 100 {
            let t = tens[n / 10]
            return n % 10 == 0 ? t : "\(t)-\(ones[n % 10])"
        }
        if n < 1000 {
            let h = "\(ones[n / 100]) hundred"
            return n % 100 == 0 ? h : "\(h) \(words(n % 100))"
        }
        return String(n)
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        var parts: [String] = []
        if h > 0 { parts.append("\(words(h)) hour\(h == 1 ? "" : "s")") }
        if m > 0 { parts.append("\(words(m)) minute\(m == 1 ? "" : "s")") }
        if s > 0 { parts.append("\(words(s)) second\(s == 1 ? "" : "s")") }
        return parts.isEmpty ? "zero seconds" : parts.joined(separator: ", ")
    }

    static func pace(_ secPerMile: Double?) -> String? {
        guard let p = secPerMile, p.isFinite, p > 0 else { return nil }
        let m = Int(p / 60), s = Int(p.truncatingRemainder(dividingBy: 60))
        guard m >= 1, m <= 99 else { return nil }
        if s == 0 { return "\(words(m)) flat" }
        if s < 10 { return "\(words(m)) oh \(words(s))" }
        return "\(words(m)) \(words(s))"
    }

    static func miles(_ miles: Double) -> String {
        if abs(miles - 0.25) < 1e-9 { return "a quarter mile" }
        if abs(miles - 0.5) < 1e-9 { return "half a mile" }
        let rounded = (miles * 100).rounded() / 100
        if rounded == rounded.rounded() && rounded >= 0 && rounded <= 20 {
            let n = Int(rounded)
            return "\(words(n)) mile\(n == 1 ? "" : "s")"
        }
        return "\(trimmed(rounded)) miles"
    }

    private static func trimmed(_ v: Double) -> String {
        var out = String(format: "%.2f", v)
        while out.hasSuffix("0") { out.removeLast() }
        if out.hasSuffix(".") { out.removeLast() }
        return out
    }

    private static func capitalizedFirst(_ s: String) -> String {
        guard let f = s.first else { return s }
        return String(f).uppercased() + s.dropFirst()
    }

    static func speak(_ m: RunMilestones.Milestone, miles: Double,
                      elapsed: TimeInterval, goal: Double?) -> String {
        switch m {
        case .mile(let n):
            let base = "Mile \(words(n)). Total time \(duration(elapsed))."
            if let p = pace(miles > 0 ? elapsed / miles : nil) { return "\(base) Average pace \(p)." }
            return base
        case .halfway:
            let remaining = max(0.25, (((goal ?? 0) - miles) * 4).rounded() / 4)
            return "Halfway there. \(capitalizedFirst(self.miles(remaining))) to go."
        case .finalStretch:
            return "Quarter mile to go. Finish strong."
        case .goal:
            return "Goal hit. \(capitalizedFirst(self.miles(goal ?? miles))). Way to run it up."
        }
    }

    static func finishSummary(miles: Double, seconds: TimeInterval, paceSecPerMile: Double?,
                              goalMiles: Double?, avgHeartRate: Int?) -> String {
        var s = "Run finished. \(capitalizedFirst(self.miles(miles))) in \(duration(seconds))."
        if let p = pace(paceSecPerMile) { s += " Average pace \(p) per mile." }
        if let hr = avgHeartRate, hr > 0 { s += " Average heart rate \(words(hr))." }
        if let g = goalMiles, miles >= g { s += " Goal complete." }
        return s
    }
}
