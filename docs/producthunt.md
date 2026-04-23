# Product Hunt Launch Materials

Launch from the **@BeddaTech** account. Target: Wednesday or Thursday, 12:01 AM PT.

---

## Tagline (60 chars max)

> Control your Android phone with AI — fully on-device

(54 chars)

Alternates:
- "On-device AI agent for Android. No cloud, no tether."
- "Your phone, controlled by Gemma 4. No cloud required."

---

## Short Description (260 chars max)

Deft is an open-source AI phone agent that controls your Android phone using natural language — entirely on-device. Gemma 4 reads your screen, reasons about what to do, and executes taps/swipes. No APIs, no subscriptions, no data leaving your phone.

(249 chars)

---

## Topics / Categories

- Artificial Intelligence
- Android
- Open Source
- Privacy
- Productivity

---

## Maker Comment (first comment — post immediately at launch)

Hey PH! I'm Matt, the founder of Deft.

**The problem I kept running into:** every "AI phone agent" I saw required either a cloud connection streaming your screen to a server, or a laptop connected via ADB. Neither is a real product.

**What Deft does differently:** Gemma 4 E4B runs entirely on your phone. No server. No subscription. Your commands, screen content, and actions never leave the device.

Under the hood, Deft is three open-source React Native libraries working together:

1. **react-native-accessibility-controller** — gives React Native full read/write access to Android's AccessibilityService, so the agent can read any app's UI tree and perform taps, swipes, and text entry.

2. **react-native-executorch** — our fork of the ExecuTorch RN library with Gemma 4 support (function calling, vision, the works).

3. **react-native-device-agent** — the agent loop: perception → reasoning → action → observation, running on-device with optional cloud fallback.

**Current state:** All three libraries are implemented and published. The Deft app brings them together with a chat interface, live action feed, session history, and guided onboarding.

We're targeting Android 10+ with Pixel 6/7/8 as the primary test devices. The Gemma 4 E4B model is ~2.5 GB and downloads once on first launch.

All repos are MIT licensed and on GitHub: github.com/bedda-tech

Happy to answer questions about the agent loop architecture, ExecuTorch integration, or the AccessibilityService approach. This was a genuinely hard engineering problem and I'm proud of how it turned out.

---

## Gallery Screenshots (what to capture)

1. **Onboarding** — "Grant Accessibility Permission" screen (clean, dark)
2. **Chat interface** — user types "Turn on Wi-Fi", agent shows thinking + actions
3. **Live action feed** — agent mid-task, showing step-by-step overlay
4. **Session history** — list of past sessions with expand/collapse
5. **Settings** — model selector, download progress bar, cloud fallback toggle

Recommended size: 1270×760 px (16:9), dark theme.

---

## Media Assets Needed

- [ ] 60-second demo video (screen recording + voiceover)
- [ ] App icon (512×512 PNG, already in assets/)
- [ ] 5 screenshots (see above)
- [ ] Optional: architecture diagram from README

---

## Launch Checklist

- [ ] All four repos public on GitHub
- [ ] README badges up to date (CI passing, npm version)
- [ ] APK available on GitHub Releases (v1.0.0 tag)
- [ ] F-Droid submission PR opened (fastlane metadata is ready)
- [ ] HN post scheduled (see tweet-threads.md)
- [ ] Reddit posts ready (r/reactnative, r/LocalLLaMA, r/androiddev)
- [ ] @BeddaTech Twitter thread queued
- [ ] Dev.to article published (see article-devto.md)
- [ ] Product Hunt gallery screenshots captured
- [ ] Maker comment drafted above, ready to post at launch

---

## Post-Launch Follow-Up

**Day 1 (launch day):**
- Reply to all PH comments within 2 hours
- Post launch tweet from @BeddaTech + @MattWhitney__
- Cross-post to r/reactnative and r/LocalLLaMA

**Day 2-3:**
- Post HN "Show HN" (see tweet-threads.md for draft)
- Reply to GitHub Discussions questions
- Publish Dev.to article with PH link

**Week 2:**
- Thank top hunters and commenters
- Post a "lessons learned" thread on Twitter
- Open "good first issue" tickets for new contributors
