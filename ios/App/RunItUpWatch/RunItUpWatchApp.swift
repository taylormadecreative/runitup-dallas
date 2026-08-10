import SwiftUI

@main
struct RunItUpWatchApp: App {
    var body: some Scene {
        WindowGroup {
            Text("RUN IT UP!")
                .font(.system(size: 18, weight: .black))
                .foregroundStyle(RIU.lime)
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
