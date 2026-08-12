import Foundation
import Capacitor
import MediaPlayer
import AVFoundation

// In-house Apple Music remote for the in-run music bar: transport control,
// now-playing state, and album/playlist pickup through the system Music app.
// Registered app-locally from RIUViewController — not an npm plugin.
// Never touches library data (nowPlayingItem, MPMediaQuery) unless
// MPMediaLibrary reports .authorized — reading it is what triggers the iOS
// media-library permission prompt. Transport commands are permission-free.
@objc(MusicRemotePlugin)
public class MusicRemotePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MusicRemotePlugin"
    public let jsName = "MusicRemote"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause",                returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "next",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previous",             returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLibrary",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCollectionArtwork", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playCollection",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSpotify",          returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings",         returnType: CAPPluginReturnPromise)
    ]

    private var notificationsStarted = false
    // Block-based addObserver(forName:object:queue:using:) returns an opaque
    // token that is the ONLY handle NotificationCenter.removeObserver accepts
    // for that registration — removeObserver(self) does not unregister these.
    private var observerTokens: [NSObjectProtocol] = []

    // Computed so merely registering the plugin does zero Music-framework work;
    // the system player is first touched when the bar renders and calls getState.
    private var player: MPMusicPlayerController { MPMusicPlayerController.systemMusicPlayer }

    private func ensureNotifications() {
        guard !notificationsStarted else { return }
        notificationsStarted = true
        player.beginGeneratingPlaybackNotifications()
        let center = NotificationCenter.default
        observerTokens.append(center.addObserver(forName: .MPMusicPlayerControllerPlaybackStateDidChange,
                           object: player, queue: .main) { [weak self] _ in self?.pushState() })
        observerTokens.append(center.addObserver(forName: .MPMusicPlayerControllerNowPlayingItemDidChange,
                           object: player, queue: .main) { [weak self] _ in self?.pushState() })
    }

    deinit {
        for token in observerTokens { NotificationCenter.default.removeObserver(token) }
    }

    // MARK: - State

    private func authString() -> String {
        switch MPMediaLibrary.authorizationStatus() {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }

    private func playbackString() -> String {
        switch player.playbackState {
        case .playing, .seekingForward, .seekingBackward: return "playing"
        case .paused: return "paused"
        case .interrupted: return "interrupted"
        default: return "stopped"
        }
    }

    private func artworkBase64(_ artwork: MPMediaItemArtwork?, side: CGFloat) -> String? {
        guard let image = artwork?.image(at: CGSize(width: side, height: side)),
              let data = image.jpegData(compressionQuality: 0.7) else { return nil }
        return data.base64EncodedString()
    }

    private func stateDict() -> [String: Any] {
        var dict: [String: Any] = [
            "native": true,
            "authStatus": authString(),
            "playbackState": playbackString(),
            "otherAudioPlaying": AVAudioSession.sharedInstance().isOtherAudioPlaying,
            "spotifyInstalled": UIApplication.shared.canOpenURL(URL(string: "spotify:")!)
        ]
        if MPMediaLibrary.authorizationStatus() == .authorized, let item = player.nowPlayingItem {
            var np: [String: Any] = [
                "title": item.title ?? "",
                "artist": item.artist ?? item.albumArtist ?? ""
            ]
            if let art = artworkBase64(item.artwork, side: 120) { np["artworkBase64"] = art }
            dict["nowPlaying"] = np
        } else {
            dict["nowPlaying"] = NSNull()
        }
        return dict
    }

    private func pushState() {
        notifyListeners("musicStateChanged", data: stateDict())
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.ensureNotifications()
            call.resolve(self.stateDict())
        }
    }

    // MARK: - Transport (permission-free)

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.play(); call.resolve() }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.pause(); call.resolve() }
    }

    @objc func next(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.player.skipToNextItem(); call.resolve() }
    }

    // Standard music-app back button: restart the track, or jump to the previous
    // one when under 3 seconds in. (iOS 16-18: assigning nowPlayingItem to jump
    // tracks silently fails — only these skip APIs work.)
    @objc func previous(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.player.currentPlaybackTime > 3.0 {
                self.player.skipToBeginning()
            } else {
                self.player.skipToPreviousItem()
            }
            call.resolve()
        }
    }

    // MARK: - Library (authorization required)

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        MPMediaLibrary.requestAuthorization { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self else { call.resolve(); return }
                self.pushState()
                call.resolve(["authStatus": self.authString()])
            }
        }
    }

    @objc func getLibrary(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized else {
                call.reject("not-authorized"); return
            }
            var rows: [[String: Any]] = []
            if kind == "albums" {
                for c in MPMediaQuery.albums().collections ?? [] {
                    guard let rep = c.representativeItem else { continue }
                    rows.append([
                        "id": String(c.persistentID),
                        "title": rep.albumTitle ?? "Untitled",
                        "subtitle": rep.albumArtist ?? rep.artist ?? ""
                    ])
                }
            } else {
                for c in MPMediaQuery.playlists().collections ?? [] {
                    let name = (c.value(forProperty: MPMediaPlaylistPropertyName) as? String) ?? "Untitled"
                    rows.append([
                        "id": String(c.persistentID),
                        "title": name,
                        "subtitle": "\(c.count) song\(c.count == 1 ? "" : "s")"
                    ])
                }
            }
            call.resolve(["items": rows])
        }
    }

    private func findCollection(kind: String, id: String) -> MPMediaItemCollection? {
        guard let pid = UInt64(id) else { return nil }
        let query = kind == "albums" ? MPMediaQuery.albums() : MPMediaQuery.playlists()
        let prop = kind == "albums" ? MPMediaItemPropertyAlbumPersistentID : MPMediaPlaylistPropertyPersistentID
        query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: pid), forProperty: prop))
        return query.collections?.first
    }

    @objc func getCollectionArtwork(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized,
                  let collection = self.findCollection(kind: kind, id: id) else {
                call.resolve(["artworkBase64": NSNull()]); return
            }
            let art = self.artworkBase64(collection.representativeItem?.artwork, side: 88)
            call.resolve(["artworkBase64": art ?? NSNull()])
        }
    }

    @objc func playCollection(_ call: CAPPluginCall) {
        let kind = call.getString("kind") ?? "playlists"
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized,
                  let collection = self.findCollection(kind: kind, id: id), collection.count > 0 else {
                call.reject("collection-not-found"); return
            }
            self.player.setQueue(with: collection)
            self.player.play()
            call.resolve()
        }
    }

    // MARK: - Escapes

    @objc func openSpotify(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: "spotify:"), UIApplication.shared.canOpenURL(url) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }
}
