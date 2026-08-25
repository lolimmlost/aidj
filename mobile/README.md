# AIDJ native shell — Capacitor spike

Goal: prove that moving **only audio playback** to native (AVQueuePlayer +
AVAudioSession) fixes background / lock-screen playback on iOS (#165, #166),
while reusing 100% of the existing web app via `server.url`.

**Non-goal:** bundling the app offline. The WKWebView loads the live server.

## What's in this branch (`spike/capacitor-native-audio`)

| File | Role |
|------|------|
| `capacitor.config.ts` | Points the shell at `server.url` (deployed app). No SSR bundling. |
| `src/lib/mobile/native-audio.ts` | Typed web↔native bridge + **web no-op shim** (app still runs unchanged in a browser). |
| `mobile/ios-plugin/NativeAudioPlugin.swift` | Draft native player: dual-deck crossfade, Now Playing, remote commands, interruptions. |
| `mobile/ios-plugin/NativeAudioPlugin.m` | ObjC registration so `registerPlugin('NativeAudio')` resolves on iOS. |
| `mobile/www/index.html` | Throwaway `webDir` placeholder for `cap sync`. |

## The vertical slice to prove (before porting the whole crossfade)

1. App loads in the native shell from `server.url`. ✅ = web reuse works.
2. `NativeAudio.prepare()` → `play({url: <navidrome stream>})` plays a track.
3. **Lock the screen / background the app for 10+ min → audio keeps playing.**
   This is the whole point — the web pipeline fails here.
4. Lock-screen controls (play/pause/next) fire `remoteCommand` events.
5. `crossfadeTo()` swaps decks with a gain ramp while backgrounded.

If (3) holds, the background-audio bug class is solved and the rest is wiring.

## How far can you get without an Apple Developer account ($99/yr)?

The paid account is **not** the gate for proving this spike. The `audio`
background mode works on **free** provisioning — it's an `Info.plist` capability
(`UIBackgroundModes: [audio]`), not a restricted entitlement (Push, iCloud, App
Groups, Associated Domains… — those need the paid program). So the background
fix for #165/#166 is provable for $0. What each tier proves:

| Tier | Needs | Proves | Gap |
|------|-------|--------|-----|
| **0 — Linux only (now)** | nothing | write/typecheck bridge, config, Swift; the whole of this branch | can't `cap add ios` / compile (macOS only) |
| **1 — docker-osx + Simulator** | macOS VM, no account, no device | app loads from `server.url`; plugin registers; `play()` makes sound; Now Playing + remote-command plumbing | ❌ background/lock-screen fix **not** trustworthy — Simulator doesn't model lock/Low-Power throttling |
| **2 — free Apple ID + real iPhone on cable** | macOS + free Apple ID + device | ✅ **the actual thing** — lock screen, background 10+ min, audio survives | certs expire every **7 days** (re-deploy weekly); ≤3 sideloaded apps, ~10 app IDs/7 days |
| **3 — paid $99** | Apple Developer Program | TestFlight (OTA, no cable), no 7-day churn, restricted entitlements, App Store | not needed to prove the spike |

**The real blocker for us isn't the account — it's connecting a real device to
macOS.** Tier 2 needs the iPhone **cabled to the Mac**, and USB passthrough into
a docker-osx QEMU VM is notoriously flaky. Without a paid account you also can't
fall back to TestFlight to dodge that. Recommended order:

1. **Tier 1 in docker-osx first** — cheap, no device: confirm the app loads in
   the shell and the plugin plays audio at all.
2. Only if green, get any **real Mac for an afternoon + free Apple ID + your
   iPhone on a cable** → full background-audio proof, $0.
3. **$99** mainly earns its keep by making the device loop painless (TestFlight,
   no cable, no 7-day churn) — worth it *after* Tier 1 checks out.

## Build loop on docker-osx (no physical Mac)

> Reality check: docker-osx can **compile**, but you still need an **Apple
> Developer account ($99/yr)** to sign + get the `audio` background entitlement,
> and background-audio must be tested on a **real device** (Simulator models it
> poorly). USB passthrough of an iPhone into the QEMU VM is flaky — the reliable
> loop is **build in the VM → upload to TestFlight → install on the phone**.

Inside the docker-osx macOS VM (Xcode + CocoaPods + Node installed):

```bash
# 1. clone the branch, install JS deps
git checkout spike/capacitor-native-audio
npm install

# 2. scaffold the iOS project (macOS-only step)
npx cap add ios

# 3. copy the draft plugin into the App target
cp mobile/ios-plugin/NativeAudioPlugin.swift ios/App/App/
cp mobile/ios-plugin/NativeAudioPlugin.m     ios/App/App/

# 4. push config (server.url) into the native project
npx cap sync ios

# 5. open in Xcode
npx cap open ios
```

In Xcode (one-time):
- **Signing & Capabilities** → add **Background Modes** → check **Audio, AirPlay, and Picture in Picture**.
- Set your Team (Apple Developer account) for signing.
- `Info.plist` already gets `UIBackgroundModes: [audio]` from the capability.

Then: build to a real device, or **Product → Archive → Distribute → TestFlight**.

Point the shell at a different server for on-device dev against `npm run dev`:

```bash
CAP_SERVER_URL="http://<your-LAN-ip>:3003" npx cap sync ios
# (add the LAN host to server.allowNavigation + NSAppTransportSecurity for http)
```

## Wiring native playback into the store (next step, not in this spike)

`src/lib/stores/audio.ts` keeps owning queue + recommendations. Where it today
drives the two `HTMLAudioElement` decks, branch on `isNativeAudioAvailable()`:

- native → `NativeAudio.play / crossfadeTo / pause`, and subscribe to
  `trackEnded` (advance queue), `remoteCommand` (lock-screen), `positionChange`
  (scrubber). The web dual-deck path stays the fallback for browsers.

Keep the delegation thin: native is a playback device, the store stays the brain.
