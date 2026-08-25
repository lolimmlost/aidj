import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

/**
 * NativeAudioPlugin — SPIKE draft.
 *
 * The native half of src/lib/mobile/native-audio.ts. Owns real sample playback
 * with AVAudioSession(.playback) so audio keeps running when the screen locks /
 * the app backgrounds — the thing a WKWebView (and thus the web crossfade)
 * cannot do reliably (#165, #166).
 *
 * Two AVPlayers (deckA/deckB) give the dual-deck crossfade natively. The web
 * app stays the source of truth for the queue + recommendations and just sends
 * commands; native emits position/ended/interruption/remote-command events back.
 *
 * NOTE: draft. After `npx cap add ios`, drop this + the .m into the iOS app
 * target (App/App). Enable Background Modes → Audio in Signing & Capabilities.
 */
@objc(NativeAudioPlugin)
public class NativeAudioPlugin: CAPPlugin {

    private let deckA = AVPlayer()
    private let deckB = AVPlayer()
    private var activeDeck: AVPlayer
    private var inactiveDeck: AVPlayer

    private var currentSongId: String?
    private var positionTimer: Timer?
    private var fadeTimer: Timer?

    public override init() {
        activeDeck = deckA
        inactiveDeck = deckB
        super.init()
    }

    // MARK: - Session

    @objc func prepare(_ call: CAPPluginCall) {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
            registerRemoteCommands()
            observeInterruptions()
            call.resolve()
        } catch {
            call.reject("AVAudioSession setup failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Transport

    @objc func play(_ call: CAPPluginCall) {
        guard let url = call.getString("url").flatMap(URL.init(string:)) else {
            return call.reject("missing/invalid url")
        }
        currentSongId = call.getString("id")
        activeDeck.replaceCurrentItem(with: AVPlayerItem(url: url))
        activeDeck.volume = 1.0
        activeDeck.play()
        observeEnd(of: activeDeck, songId: currentSongId)
        startPositionTimer()
        updateNowPlaying(from: call)
        call.resolve()
    }

    @objc func pause(_ call: CAPPluginCall) {
        activeDeck.pause()
        emitState(audioState: "suspended")
        call.resolve()
    }

    @objc func resume(_ call: CAPPluginCall) {
        try? AVAudioSession.sharedInstance().setActive(true)
        activeDeck.play()
        emitState(audioState: "running")
        call.resolve()
    }

    @objc func seek(_ call: CAPPluginCall) {
        let sec = call.getDouble("positionSec") ?? 0
        activeDeck.seek(to: CMTime(seconds: sec, preferredTimescale: 1000))
        call.resolve()
    }

    // MARK: - Crossfade (dual-deck, native)

    @objc func crossfadeTo(_ call: CAPPluginCall) {
        guard let url = call.getString("track.url").flatMap(URL.init(string:))
            ?? (call.getObject("track")?["url"] as? String).flatMap(URL.init(string:)) else {
            return call.reject("missing track.url")
        }
        let durationMs = call.getDouble("durationMs") ?? 1000
        let nextId = (call.getObject("track")?["id"] as? String)

        inactiveDeck.replaceCurrentItem(with: AVPlayerItem(url: url))
        inactiveDeck.volume = 0.0
        inactiveDeck.play()
        observeEnd(of: inactiveDeck, songId: nextId)

        // Linear gain ramp over durationMs, then swap decks.
        let steps = 30
        let interval = (durationMs / 1000.0) / Double(steps)
        var step = 0
        fadeTimer?.invalidate()
        fadeTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] t in
            guard let self else { return t.invalidate() }
            step += 1
            let p = Float(step) / Float(steps)
            self.activeDeck.volume = 1.0 - p
            self.inactiveDeck.volume = p
            if step >= steps {
                t.invalidate()
                self.activeDeck.pause()
                swap(&self.activeDeck, &self.inactiveDeck)
                self.currentSongId = nextId
                self.emitState(audioState: "running")
            }
        }
        call.resolve()
    }

    @objc func setQueue(_ call: CAPPluginCall) {
        // Spike: queue is tracked web-side; native uses it only for lock-screen
        // next/prev + preloading. Wire preloading here when the slice proves out.
        call.resolve()
    }

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(stateDict(audioState: activeDeck.rate > 0 ? "running" : "suspended"))
    }

    // MARK: - Now Playing / remote commands

    private func registerRemoteCommands() {
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.emitRemote("play"); self?.activeDeck.play(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.emitRemote("pause"); self?.activeDeck.pause(); return .success }
        c.nextTrackCommand.addTarget { [weak self] _ in self?.emitRemote("next"); return .success }
        c.previousTrackCommand.addTarget { [weak self] _ in self?.emitRemote("previous"); return .success }
    }

    private func updateNowPlaying(from call: CAPPluginCall) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: call.getString("title") ?? "",
            MPMediaItemPropertyArtist: call.getString("artist") ?? "",
        ]
        if let dur = call.getDouble("durationSec") { info[MPMediaItemPropertyPlaybackDuration] = dur }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        // TODO: async-load artworkUrl → MPMediaItemArtwork.
    }

    // MARK: - Interruptions (call / Siri / route change)

    private func observeInterruptions() {
        NotificationCenter.default.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc private func handleInterruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            emitState(audioState: "interrupted")
        case .ended:
            try? AVAudioSession.sharedInstance().setActive(true)
            activeDeck.play()
            emitState(audioState: "running")
        @unknown default: break
        }
    }

    // MARK: - End-of-track

    private func observeEnd(of player: AVPlayer, songId: String?) {
        guard let item = player.currentItem else { return }
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
            self?.notifyListeners("trackEnded", data: ["songId": songId ?? ""])
        }
    }

    // MARK: - Events

    private func startPositionTimer() {
        positionTimer?.invalidate()
        positionTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.emitState(audioState: "running")
        }
    }

    private func stateDict(audioState: String) -> [String: Any] {
        let pos = activeDeck.currentItem?.currentTime().seconds ?? 0
        let dur = activeDeck.currentItem?.duration.seconds ?? 0
        return [
            "songId": currentSongId ?? "",
            "isPlaying": activeDeck.rate > 0,
            "positionSec": pos.isFinite ? pos : 0,
            "durationSec": dur.isFinite ? dur : 0,
            "audioState": audioState,
        ]
    }

    private func emitState(audioState: String) {
        notifyListeners("positionChange", data: stateDict(audioState: audioState))
        notifyListeners("audioStateChange", data: stateDict(audioState: audioState))
    }

    private func emitRemote(_ command: String) {
        notifyListeners("remoteCommand", data: ["command": command])
    }
}
