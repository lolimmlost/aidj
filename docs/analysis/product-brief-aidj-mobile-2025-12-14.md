---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: ['docs/project-brief.md', 'docs/architecture.md', 'conversation-context']
workflowType: 'product-brief'
lastStep: 6
status: 'complete'
project_name: 'AIDJ Mobile'
user_name: 'Dev Gansta'
date: '2025-12-14'
completed_date: '2025-12-14'
---

# Product Brief: AIDJ Mobile

**Date:** 2025-12-14
**Author:** Dev Gansta

---

## Executive Summary

AIDJ Mobile is a privacy-first, self-hosted music companion app that transforms your Navidrome library into an intelligent personal DJ experience. Unlike existing Navidrome clients that simply play music, AIDJ learns your taste, recommends new discoveries, and (in future versions) creates seamless DJ-quality mixes with crossfade and BPM matching.

**Positioning:** *"Your Personal DJ That Actually Knows You"*

The app solves a core frustration: homelab enthusiasts who self-host their music libraries lack a cohesive, intelligent mobile experience. Existing clients like Amperfy provide basic playback but miss the smart features modern listeners expect - recommendations, lyrics, listening analytics, and discovery. AIDJ bridges this gap while keeping everything private and self-hosted.

**The Promise:** The more you use AIDJ, the smarter it gets. Your DJ grows with you.

**MVP Focus:** Reliable iOS/Android playback with background audio, library browsing, search, queue management, and LastFM scrobbling.

**Long-term Vision:** A personal AI DJ that knows your taste, grows your library automatically via Lidarr, and creates professional-quality mixes with crossfade and beat matching.

---

## Core Vision

### Problem Statement

Homelab enthusiasts who self-host their music libraries (via Navidrome) lack a cohesive mobile experience. They've chosen privacy over convenience, but existing mobile clients force them to sacrifice intelligent features that mainstream services provide.

The core tension: **privacy OR smart features** - never both.

### Problem Impact

**For Self-Hosters:**
- Existing Navidrome clients are basic players with no intelligence
- No recommendations based on listening history
- No lyrics integration
- No listening analytics or recaps
- Fragmented experience across devices
- Background audio often unreliable on iOS

**The Result:**
- Users tolerate subpar mobile experiences
- Or abandon self-hosting for Spotify/Apple Music
- The "DJ dream" of seamless, personalized mixes remains unrealized

### Why Existing Solutions Fall Short

| Solution | Gap |
|----------|-----|
| **Amperfy** | Works but lacks cohesion - no recommendations, lyrics, or smart features |
| **Substreamer** | Basic playback only, dated interface |
| **play:Sub** | iOS native but feature-limited |
| **Spotify/Apple Music** | Smart features but no privacy, no ownership, algorithm controls you |
| **Navidrome Web** | Full features but no background audio on mobile |

**The fundamental gap:** No solution combines self-hosted privacy with intelligent, DJ-quality music experience.

### Proposed Solution

AIDJ Mobile - a React Native (Expo) app that connects directly to your Navidrome server and delivers intelligent music curation.

**The "Wow Moment":**
```
User plays first song
       ↓
AIDJ: "Nice choice! Based on this, you might vibe with..."
       ↓
Shows 3-5 recommended songs with swipeable cards
       ↓
User swipes right (love) or left (not for me)
       ↓
AIDJ: "Got it! Let me find more like that..."
       ↓
Next recommendations get BETTER
       ↓
User: "Wait, it actually learned!"
```

**AIDJ Has Personality:**
Instead of sterile UI, AIDJ talks to you like a friend:

| Moment | AIDJ Says |
|--------|-----------|
| First open | "Hey! I'm AIDJ. I'm about to become your favorite DJ." |
| First recommendation | "Based on that track, I think you'd dig these..." |
| After 👍 | "Nice! More where that came from." |
| After 👎 | "Not your thing? I'll remember that." |
| After 10 ratings | "I'm starting to get you. Check this out..." |

### Key Differentiators

| Differentiator | Why It Matters |
|----------------|----------------|
| **Intelligence First** | Not just a player - AIDJ learns, recommends, and evolves with your taste |
| **Privacy-First Architecture** | Direct connection to your Navidrome - no cloud, no tracking |
| **Library Growth Loop** | Discover → Like → Download (Lidarr) → Play - your library grows intelligently |
| **Personality-Driven UX** | AIDJ feels like talking to a friend, not configuring software |
| **DJ DNA** | Built with real DJ features in mind - crossfade, BPM, beat matching on roadmap |

**Value Proposition Stack:**
1. 🎯 **Primary:** Intelligent recommendations that actually work
2. 🔒 **Secondary:** Self-hosted privacy (trust signal)
3. 📈 **Tertiary:** Library growth via Lidarr (power feature)

---

## Phased Roadmap

### MVP (2 Weeks) - "The Foundation"

| Feature | Why It's MVP |
|---------|--------------|
| ✅ Auth (Better Auth) | Gate to everything |
| ✅ Navidrome direct connection | Core data source |
| ✅ Library browse (Artist→Album→Song) | Basic navigation |
| ✅ Search | User expectation |
| ✅ Audio playback | Core function |
| ✅ **Background audio + lock screen controls** | iOS deal-breaker otherwise |
| ✅ Queue management | Usability essential |
| ✅ Scrobble to Navidrome | Track plays |

**MVP delivers:** "A Navidrome client that actually works on mobile."

### v1.1 (Post-MVP, 2-4 weeks) - "The Intelligence"

| Feature | Dependency |
|---------|------------|
| 🔶 LastFM scrobbling | API key ready |
| 🔶 LastFM recommendations | After scrobbling works |
| 🔶 Thumbs up/down on recommendations | UI + local storage |
| 🔶 Basic preference learning | Local algorithm |
| 🔶 "AIDJ personality" messages | Copy + conditional UI |

**v1.1 delivers:** "A Navidrome client that starts learning you."

### v1.2 (1-2 months) - "The Experience"

| Feature | Complexity |
|---------|------------|
| 🔷 Lyrics (fallback chain) | Medium |
| 🔷 Listening recaps (weekly/monthly) | Medium |
| 🔷 Smart playlists | Medium |
| 🔷 TTS voice for AIDJ | Medium |

### v2+ (3-6 months) - "The DJ Dream"

| Feature | Complexity |
|---------|------------|
| 🔴 Crossfade | High |
| 🔴 BPM detection | High |
| 🔴 Beat matching | Very High |
| 🔴 Lidarr integration | Medium |
| 🔴 Auto-download recommendations | Medium |

**v2 delivers:** "Your actual personal DJ that mixes and grows your library."

---

## Go-To-Market Strategy

**Target Comp:** Immich (self-hosted Google Photos) - started small, grew through passionate self-hosted community.

**Launch Playbook:**

| Phase | Action |
|-------|--------|
| **Seed** | Launch in r/selfhosted, r/navidrome, r/homelab |
| **Hook** | "Finally, smart music that's actually yours" |
| **Differentiate** | Recommendations that actually work |
| **Grow** | Community contributions, LastFM + Lidarr pipeline |

**Target User:** Self-hosts Navidrome, technically competent, left Spotify for ownership/privacy, misses discovery features.

**Be Opinionated:** "We're the smart Navidrome client. If you want dumb playback, use something else."

---

## Target Users

### Persona Priority

| Priority | Persona | Version | Focus |
|----------|---------|---------|-------|
| **P0** | Homelab Music Enthusiast | MVP | Volume play - core user |
| **P1** | Friends/Partner (multi-profile) | v1.x | Shared library, different tastes |
| **P2** | Professional DJ | v2+ | Credibility play - set building |
| **P3** | Party Guests (Jukebox) | v2+ | Social listening mode |

### Primary User: The Homelab Music Enthusiast

**Profile:** Developer / homelab enthusiast with full self-hosted stack
**Setup:** TrueNAS + Lidarr + Navidrome + Ollama + LastFM API ready
**Motivation:** Left Spotify for ownership/privacy, wants intelligent discovery back

**Current State:**
- Has great library but discovery is manual
- Shuffles subset of liked songs - no intelligent curation
- Web app doesn't work on mobile (no background audio)
- All the components exist but no "glue" connecting them

**Listening Pattern:**
- Music ALL DAY, every day
- Primarily mobile streaming
- Occasionally web
- Wants **set-and-forget** with ability to **nudge** direction

**The "Nudge Mode" Insight:**
```
Listening on autopilot...
       ↓
Great song comes up! 🔥
       ↓
Quick action: "More like this" (one tap)
       ↓
AIDJ shifts the vibe for next few tracks
       ↓
Back to autopilot, but now it's YOUR direction
```

**Key Interaction:** Double-tap or swipe for "more like this" - low friction, high impact.

**Success Criteria:**
- Open app, hit play, AIDJ handles the rest
- Can nudge direction without breaking flow
- Recommendations improve visibly over time
- Discovers forgotten gems in own library
- Seamless background playback that just works

### Future Persona: The Professional DJ (v2+)

**Profile:** Professional DJ using the platform for set building
**Setup:** Access to Navidrome library (shared or own)
**Motivation:** Build sets faster, discover tracks that fit specific vibes/BPM

**Why v2:**
- Requires BPM browsing (audio analysis)
- Requires set building UI (playlist + ordering)
- Requires beat matching (real-time DSP)
- Don't let this creep into MVP scope

**Strategic Value:** "Built by someone whose brother is a pro DJ" = credibility for positioning.

### Secondary Users

| User Type | Use Case | Version | Notes |
|-----------|----------|---------|-------|
| **Friends with shared access** | Own recommendations on shared library | v1.x | Multi-profile support |
| **Partner** | Separate taste profile on same Navidrome | v1.x | Different LastFM accounts |
| **Party guests** | Jukebox mode - queue songs socially | v2+ | Limited access, queue only |

### User Journey

**Discovery → Value Loop:**

```
r/selfhosted or r/navidrome post
         ↓
"Finally, smart music for self-hosters"
         ↓
Download app, connect Navidrome (2 min setup)
         ↓
Play first song → Music flows → Background audio works!
         ↓
Great track → Double-tap "more like this"
         ↓
💡 "Wait, it actually shifted the vibe!"
         ↓
Daily driver for all music listening
         ↓
v1.1: Recommendations get smarter over time
         ↓
v2: Library grows via Lidarr, DJ features unlock
```

**Key "Aha" Moments:**
1. Background audio that actually works on iOS
2. "More like this" instantly shifts the queue
3. First recommendation that's actually good (v1.1)
4. "It remembered I don't like [Artist]" (v1.1)
5. Rediscovering a forgotten track in own library

### Interaction Modes

| Mode | User State | UI Focus | MVP? |
|------|------------|----------|------|
| **Flow Mode** | Passive, lean-back, all-day listening | Minimal UI, big album art, auto-queue | ✅ Yes |
| **Nudge Mode** | Quick steering without breaking flow | "More like this" gesture | ✅ Yes (gesture) |
| **Build Mode** | Active curation, set building | Filters, BPM, drag-to-playlist | ❌ v2 |

**MVP = Flow Mode + Nudge gesture. Build Mode is Pro DJ territory (v2).**

---

## Success Metrics

### The North Star

**MVP Gate:** Background audio works reliably for all-day listening with graceful handling of system interruptions.

> *"Play music at 9am, use phone normally, music still playing at 5pm with no manual intervention."*

If this fails, nothing else matters. This is the foundation everything else builds on.

### Background Audio Test Criteria

| Scenario | Pass Criteria |
|----------|---------------|
| 2-hour background session | No unexpected stops |
| Incoming phone call | Pauses, resumes after call ends |
| Alarm interruption | Pauses, resumes after dismiss |
| Lock/unlock cycle | Continues playing |
| App switch (multitasking) | Continues playing |
| App killed from memory | Continues via iOS audio session |
| Network interruption | Shows clear error, resumes when network returns |

**"Day in the Life" Test:** Start playing at 9am, use phone normally all day, music still playing at 5pm. If this passes, background audio is solid.

### User Success Metrics

| Metric | Definition | Target | Timeframe |
|--------|------------|--------|-----------|
| **Daily Driver** | App is primary music player | Used every day | Week 1 post-MVP |
| **No Spotify Regression** | Haven't opened Spotify for music | 0 Spotify sessions | Month 1 |
| **Background Reliability** | User says "it just works" | No complaints | Week 1 |
| **Discovery Moments** | Found forgotten songs in own library | 10+ rediscoveries | Month 1 |
| **"More Like This" Usage** | Nudge gesture used to steer music | Used weekly | v1.1 |

### Success Signals by Phase

**MVP Success (2 weeks):**
- [ ] Background audio passes "Day in the Life" test
- [ ] Can browse library and play any song
- [ ] Queue management works
- [ ] Lock screen controls function correctly
- [ ] Using it daily instead of alternatives

**v1.1 Success (1 month):**
- [ ] LastFM recommendations are actually good
- [ ] "More like this" influences next songs noticeably
- [ ] Scrobbles appearing in LastFM account
- [ ] Haven't opened Spotify in weeks

**v1.2 Success (2-3 months):**
- [ ] Weekly listening feels curated, not random
- [ ] Discovered music I forgot I had
- [ ] Friends/brother asking how to set it up
- [ ] Never looked back to Spotify

### Community Metrics (Optional Growth)

| Objective | Metric | Target |
|-----------|--------|--------|
| **Community Validation** | GitHub stars | 100+ stars in 3 months |
| **Adoption** | r/selfhosted post engagement | 50+ upvotes on launch |
| **Word of Mouth** | Friends/family using it | 3+ users on your instance |
| **Sustainability** | Using > Maintaining | Ratio improves weekly |

### Key Performance Indicators

**Leading Indicators (predict success):**
- App opens per day
- Songs played per session
- Background audio session duration (uninterrupted)
- "More like this" taps per week

**Lagging Indicators (confirm success):**
- Days since last Spotify use
- LastFM scrobble count growth
- Library discoveries (songs played for first time in 6+ months)

### Anti-Metrics (What We're NOT Optimizing For)

| Anti-Metric | Why We Ignore It |
|-------------|------------------|
| Total user count | Personal project, not growth startup |
| Time in app | Want efficient music access, not engagement farming |
| Feature count | Focused MVP > feature bloat |
| Monetization | Not the goal |

---

## MVP Scope

### Core Principle

**Scope:** Focused and achievable in 2 weeks.
**Quality Bar:** UI/UX must be polished and professional. Now Playing screen is the hero.

### MVP Features (Final)

| Feature | Priority | Notes |
|---------|----------|-------|
| **Auth (Better Auth)** | P0 | Clean login flow |
| **Navidrome direct connection** | P0 | Credentials in SecureStore (set once) |
| **Library browse** | P0 | Artist → Album → Song hierarchy |
| **Search** | P0 | Search songs/artists/albums |
| **Audio playback** | P0 | Core function |
| **Background audio** | P0 | THE north star - must be flawless |
| **Lock screen controls** | P0 | Play/pause, skip, previous |
| **Queue management** | P0 | View, reorder, remove |
| **Scrobble to Navidrome** | P1 | Track plays |

### UI/UX Requirements

**Quality Bar:** Polished and professional, not "developer art."

| Element | Requirement |
|---------|-------------|
| **Now Playing** | Hero screen - 30% of UI effort here |
| **Album Art** | Large, crisp, min 300x300, rounded corners |
| **Design System** | Consistent purple/indigo accent, dark theme |
| **Typography** | Clean hierarchy, proper truncation |
| **Touch Targets** | Minimum 44px, responsive feedback |
| **Scroll Performance** | 60fps, no jank |
| **Loading States** | Graceful, not jarring |

**UI Tech Stack:**
- NativeWind (Tailwind) for styling
- expo-image for album art (with caching)
- react-native-reanimated for essential animations
- Standard Pressable for touch feedback

**Deferred to v1.0.1 Polish Sprint:**
- Blurred album art backgrounds
- Complex gesture interactions
- Custom haptics
- Micro-animations

### UI Quality Checklist

| Test | Pass Criteria |
|------|---------------|
| Album art rendering | No pixelation, loads <500ms |
| Navigation transitions | <300ms, smooth |
| Text truncation | Long titles ellipsis correctly |
| Dark mode contrast | All text readable (4.5:1 ratio) |
| Touch targets | All buttons >44px |
| Scroll performance | 60fps, no jank |

### Out of Scope for MVP

| Feature | Version | Reason |
|---------|---------|--------|
| LastFM scrobbling | v1.1 | Focus on core playback first |
| LastFM recommendations | v1.1 | Intelligence layer after foundation |
| "More like this" gesture | v1.1 | Requires LastFM integration |
| Thumbs up/down | v1.1 | Requires preference storage |
| AIDJ personality messages | v1.1 | Polish after core works |
| Lyrics | v1.2 | Multiple source integration |
| Listening recaps | v1.2 | Requires history accumulation |
| Smart playlists | v1.2 | Rule engine complexity |
| Multi-user profiles | v1.x | Single user for MVP |
| Crossfade | v2 | Audio processing complexity |
| BPM detection | v2 | Audio analysis |
| Beat matching | v2+ | Real-time DSP |
| Lidarr integration | v2 | Download workflow |
| CarPlay / Android Auto | v2+ | Platform integration |
| Widgets | v2+ | Platform integration |
| TTS voice | v2+ | Nice to have |

### MVP Success Gate

**Launch Checklist:**
- [ ] Background audio passes "Day in the Life" test (9am-5pm)
- [ ] Library browsing is fast and responsive
- [ ] Search returns results quickly
- [ ] Queue management feels intuitive
- [ ] Lock screen controls work perfectly
- [ ] Now Playing screen looks beautiful
- [ ] UI passes quality checklist
- [ ] No crashes during normal use
- [ ] Setup takes < 5 minutes

**Quality Gate:** Would you be proud to show this to a friend? If not, it's not MVP-complete.

### Future Vision

**v1.0.1 - Polish Sprint (1 week post-MVP):**
- UI micro-animations
- Blurred album art backgrounds
- Haptic feedback refinement
- Edge case polish

**v1.1 - "The Intelligence" (2-4 weeks post-MVP):**
- LastFM scrobbling + recommendations
- "More like this" nudge gesture
- Basic preference learning
- AIDJ personality emerges

**v1.2 - "The Experience" (1-2 months):**
- Lyrics with fallback chain
- Listening recaps
- Smart playlists
- Multi-user profiles

**v2 - "The DJ Dream" (3-6 months):**
- Crossfade transitions
- BPM-aware browsing
- Lidarr integration (discover → download → play)
- Beat matching for seamless mixes
- Pro DJ set-building mode

### Long-term Vision

> *"AIDJ becomes the default way you interact with your music. It knows your taste better than any streaming service, grows your library intelligently, and creates mixes that feel like a personal DJ crafted them just for you - all while keeping your data completely private."*

