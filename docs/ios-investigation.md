# iOS Support Investigation

**Status**: Research complete — not recommended for v1.x without entitlement exceptions  
**Date**: 2026-06-02  
**Author**: deft-engineering agent

---

## Executive Summary

Deft's Android agent works because `AccessibilityService` gives it a unique combination of privileges: reading the full UI tree of any app, dispatching gestures, setting text, and taking screenshots — all from a background process. iOS has no direct equivalent of this API. Every path to comparable functionality on iOS hits either Apple's sandbox, App Store review policy, or private-framework restrictions. This document maps each capability against what iOS offers, assesses the engineering cost, and recommends a strategy.

**Bottom line**: A full-fidelity iOS port is not feasible within App Store distribution rules today. The closest practical path is an enterprise/MDM-only distribution using `AXRuntime` with a special Apple entitlement — a meaningful product but a different go-to-market.

---

## 1. AccessibilityService Equivalent on iOS

### What Android gives us

`AccessibilityService` is a system-registered background service that, when the user enables it in *Settings → Accessibility*, grants:

- **Full UI tree access** (`rootInActiveWindow` → `AccessibilityNodeInfo` tree for any foreground app)
- **Action dispatch** (`performAction` on any node — click, long-click, set text, scroll)
- **Gesture injection** (`dispatchGesture` with arbitrary stroke paths via `GestureDescription`)
- **Global actions** (`performGlobalAction` — HOME, BACK, RECENTS, NOTIFICATIONS, QUICK_SETTINGS)
- **Screenshots** (`takeScreenshot`, API 30+)
- **Event stream** (every `AccessibilityEvent` from every app, in real time)

### iOS Option A: UIAccessibility (Public API)

`UIAccessibility` is Apple's public accessibility framework. It is entirely **read-write for your own app, read-nothing for other apps**.

What it can do:
- Expose accessibility elements within the host app to VoiceOver (`UIAccessibilityElement`, `accessibilityLabel`, etc.)
- Post announcements via `UIAccessibility.post(notification: .announcement, argument: "text")` — VoiceOver speaks the string aloud
- Trigger screen-changed notifications so VoiceOver moves focus within the host app
- Receive `UIAccessibility.focusedElement(using:)` — returns the element VoiceOver is currently focused on **within the host app only**

What it cannot do:
- Read the UI tree of any other app
- Dispatch taps, gestures, or text input to another app
- Take screenshots (outside of `UIScreen.snapshotView` on the host app's own window)

**Reference**: [UIAccessibility — Apple Developer Documentation](https://developer.apple.com/documentation/uikit/uiaccessibility)

### iOS Option B: AXRuntime (Private Framework)

`AXRuntime.framework` is the private framework VoiceOver uses internally on both iOS and macOS. On macOS, `AXUIElement` APIs are public and provide full system-wide UI tree access (analogous to Android's `AccessibilityNodeInfo`). On iOS, the same `AXUIElement` types exist but are gated by a private entitlement.

What AXRuntime provides on iOS (with the entitlement):
- `AXUIElementCreateSystemWide()` or per-process element access — the same tree-walking API used on macOS
- Read access: element labels, roles, values, positions, children
- Action dispatch: `AXUIElementPerformAction(element, kAXPressAction)` (tap), `kAXSetValueAttribute` (set text)
- Event subscriptions via `AXObserver`

**Required entitlement**: `com.apple.developer.accessibility.api` (or the newer scoped equivalent). Apple grants this only to assistive-technology apps — Switch Control, VoiceOver training tools, and some third-party AT apps. The entitlement is not publicly available in the Apple Developer portal; it requires manual review and approval from Apple's accessibility team.

**Gesture injection**: Even with AXRuntime, coordinate-based gesture injection (`IOHIDEvent` → `IOSurface`) is a separate private API (`GSEvent`/`UIApplication._sendEventForTesting`). This is the mechanism Xcode's UI testing infrastructure uses, which is why UI tests must run on a device connected to Xcode. There is no entitlement path for shipping this capability to end users — it is development-infrastructure-only.

**References**:
- [AXUIElement — macOS documentation](https://developer.apple.com/documentation/applicationservices/axuielement-h) (iOS has the same ABI but no public docs)
- [A11y Inspector internals (WWDC 2019)](https://developer.apple.com/videos/play/wwdc2019/254/)
- [AccessibilitySnapshot library — describes AXRuntime surface area](https://github.com/cashapp/AccessibilitySnapshot)

### Capability Gap Summary

| Deft Android capability | iOS public API | iOS with AXRuntime entitlement | Notes |
|---|---|---|---|
| `getAccessibilityTree()` | ❌ | ✅ (read-only) | AXRuntime gives labels/roles/values; not all Android fields map |
| `tapNode(nodeId)` | ❌ | ✅ (via `kAXPressAction`) | Works for buttons, links; less reliable for custom views |
| `longPressNode(nodeId)` | ❌ | ⚠️ (no direct long-press action; workaround via `kAXShowMenuAction`) | Partial |
| `setNodeText(nodeId, text)` | ❌ | ✅ (via `kAXSetValueAttribute`) | Works for text fields |
| `scrollNode(nodeId, dir)` | ❌ | ✅ (via `kAXScrollAction`) | Works for scroll views |
| `tap(x, y)` | ❌ | ❌ | Requires private `IOHIDEvent`; no entitlement path |
| `longPress(x, y)` | ❌ | ❌ | Same — private gesture injection |
| `swipe(...)` | ❌ | ❌ | Same |
| `globalAction('home')` | ❌ | ❌ | No programmatic Home button; only via Siri shortcut |
| `globalAction('back')` | N/A (no back on iOS) | N/A | |
| `globalAction('notifications')` | ❌ | ❌ | |
| `openApp(bundleId)` | ✅ (URL schemes) | ✅ (URL schemes) | Only apps that publish a URL scheme; no universal open |
| `getInstalledApps()` | ❌ | ❌ | `LSApplicationWorkspace` is private; `canOpenURL` only checks specific schemes |
| `takeScreenshot()` | ❌ (other apps) | ❌ | `UIScreen.snapshotView` own app only; `ReplayKit` requires user confirmation |
| `showOverlay()` | ✅ within host app | ✅ within host app | Cannot draw over other apps — no `SYSTEM_ALERT_WINDOW` equivalent |
| `isServiceEnabled()` | — | Always false on iOS | |
| `onAccessibilityEvent()` | ❌ | ⚠️ (via `AXObserver`, limited event types) | Not a real-time stream; polling required for many use cases |

---

## 2. App Store Policy Constraints

### What the App Store permits

Apps in the standard App Store distribution can:
- Use `UIAccessibility` for their own UI
- Use `UIApplication.shared.open(url:)` to launch other apps via registered URL schemes
- Use `ReplayKit` to record the screen — **with an explicit user confirmation prompt per session**
- Use `UIApplication.shared.canOpenURL()` against a pre-declared list of URL schemes (limited to 50 URLs per app, declared in `LSApplicationQueriesSchemes`)
- Use App Intents and Shortcuts to expose the app's own actions to the Shortcuts.app

### What requires a restricted entitlement (not normally granted)

- `com.apple.developer.accessibility.api` — AXRuntime cross-app tree access. Requires filing an entitlement request with Apple's accessibility team. Granted only to demonstrably AT-focused apps (screen readers, switch access tools).
- `com.apple.security.automation.apple-events` — AppleScript-style automation; macOS only.
- `com.apple.developer.siri` — SiriKit; allows responding to specific intent categories, not arbitrary automation.

### What is explicitly prohibited

- Any use of private frameworks (`AXRuntime`, `IOHIDFamily`, `SpringBoardServices`) in App Store submissions. Apple's static analysis (`otool`/binary scan during review) flags private API usage. Apps detected using private APIs are rejected or pulled post-release.
- Distributing `IOHIDEvent` gesture injection to end users. Even if an app technically links to the private framework, doing so for the purpose of controlling other apps is a guideline 2.5.1 violation ("Apps may not use private APIs or undocumented APIs").

**Reference**: [App Store Review Guidelines 2.5.1](https://developer.apple.com/app-store/review/guidelines/#software-requirements)

### Enterprise / Developer Enterprise Program

Apple's **Apple Developer Enterprise Program (ADEP)** allows companies to distribute apps internally without App Store review. This removes the review-based private-API enforcement, but does not remove iOS sandbox enforcement. Apps distributed via enterprise provisioning profiles still run in the same sandbox as App Store apps — they can call private APIs without fear of App Store rejection, but those private APIs must still be permitted by the iOS kernel sandbox profile.

The practical implication: AXRuntime calls from an enterprise-signed app will work if the entitlement is present in the provisioning profile (entitlements are enforced by the kernel, not just App Store review). An enterprise provisioning profile CAN include `com.apple.developer.accessibility.api` if Apple's enterprise team approves it — but this requires a separate agreement and review process.

**Reference**: [Apple Developer Enterprise Program](https://developer.apple.com/programs/enterprise/)

---

## 3. Supervised Device Mode

### What supervision unlocks

iOS devices become "supervised" when enrolled in MDM (Mobile Device Management) via Apple Configurator 2 or an MDM solution (Jamf Pro, Mosyle, Kandji, etc.). Supervision is a one-time configuration that must happen before or at initial device setup (it cannot be applied to a device already in use without a factory reset, in most cases).

Supervised mode unlocks:

- **Autonomous Single App Mode (ASAM)**: an MDM-enrolled app can programmatically call `UIAccessibility.requestGuidedAccessSession(enabled:options:completionHandler:)` to lock the device to itself. Useful for kiosks; not useful for a multi-app phone agent.
- **App installation and removal**: MDM can push/pull apps silently without user prompts.
- **VPN and Wi-Fi profiles**: installed silently.
- **Content filtering**: can block or allow specific URLs, domains, apps.
- **Screen time and restrictions**: granular control over what apps the user can access.
- **Remote screen observation**: MDM solutions (specifically Jamf) can view the screen in real time on supervised devices using Apple's [Device Enrollment Program APIs](https://developer.apple.com/documentation/devicemanagement) — this is read-only observation, not interaction.

### What supervision does NOT unlock

Critically:
- **Cross-app UI tree access**: no MDM entitlement unlocks `AXRuntime` for third-party apps. The accessibility entitlement path is separate from MDM supervision.
- **Gesture injection to other apps**: not available at any MDM level.
- **Background execution beyond what iOS allows**: supervised apps still respect iOS background execution limits. An app cannot run an agent loop in the background indefinitely unless it holds an appropriate background mode (audio, location, VOIP, etc.).

### Supervised + AXRuntime: the viable enterprise path

The one viable combination for a functional iOS agent is:

1. Enroll device as supervised via MDM.
2. Distribute Deft via enterprise provisioning profile (ADEP) — bypasses App Store review.
3. Include `com.apple.developer.accessibility.api` in the enterprise provisioning profile, after Apple approval.
4. Use AXRuntime for cross-app tree access and action dispatch (tap, set text, scroll).
5. Use MDM-level screen observation for screenshot capability (or accept no screenshots).
6. Accept that coordinate-based gesture dispatch (`tap(x,y)`, `swipe`) is not available; agent must operate entirely via accessibility actions on named nodes.

This is a meaningful subset of capability — enough for an agent that can navigate between apps (via URL schemes), read UI content, tap elements, and enter text. It is not enough for apps that rely on coordinate-based taps, visual screenshots as context, or apps with poor accessibility markup.

**Reference**: [Mobile Device Management Protocol Reference](https://developer.apple.com/documentation/devicemanagement)

---

## 4. Recommendation

### Verdict: iOS App Store port is not viable today

The core Deft value proposition — an on-device AI agent that can read and control any app — cannot be delivered via App Store distribution on iOS. The two hardest blockers are:

1. **No public cross-app UI tree API**: Without `AXRuntime` and its restricted entitlement, the agent cannot see what is on screen in another app.
2. **No coordinate gesture injection**: Even with AXRuntime, `tap(x, y)` and `swipe(...)` require private `IOHIDEvent` APIs that are blocked by both the kernel sandbox and App Store policy.

### Preferred first approach: Enterprise/MDM path (post-v1.x)

If iOS support is pursued, the recommended first step is:
1. Apply to Apple's accessibility team for `com.apple.developer.accessibility.api`.
2. Establish a supervised-device enterprise distribution flow for beta users.
3. Implement AXRuntime bindings in `react-native-accessibility-controller` as a second native target (iOS source in `ios/` directory).
4. Accept the reduced capability set: tree reading, semantic actions (tap/setText/scroll), URL-based app launch. Drop: coordinate gestures, screenshots from other apps, overlay-over-other-apps.

The agent would need to be redesigned to rely exclusively on accessibility tree navigation (no coordinate fallbacks), which actually makes it more robust for all apps that have good VoiceOver support.

### What would need to change in react-native-accessibility-controller

**Package structure** (currently Android-only):

```
react-native-accessibility-controller/
  android/          ← existing
  ios/              ← new, to be created
    AccessibilityController.h
    AccessibilityController.mm   ← ObjC++, links AXRuntime
    AccessibilityControllerModule.mm
```

**Per-function implementation plan**:

| Function | iOS implementation | Effort |
|---|---|---|
| `getAccessibilityTree()` | `AXUIElementCreateSystemWide()` → walk children, map to `AccessibilityNode` | High — schema mapping, node ID generation |
| `tapNode(nodeId)` | `AXUIElementPerformAction(el, kAXPressAction)` | Medium |
| `longPressNode(nodeId)` | `AXUIElementPerformAction(el, kAXShowMenuAction)` or equivalent | Medium |
| `setNodeText(nodeId, text)` | `AXUIElementSetAttributeValue(el, kAXValueAttribute, text)` | Medium |
| `scrollNode(nodeId, dir)` | `AXUIElementPerformAction(el, kAXScrollAction + direction)` | Medium |
| `tap(x, y)` | ❌ Not implementable | — |
| `longPress(x, y)` | ❌ Not implementable | — |
| `swipe(...)` | ❌ Not implementable | — |
| `globalAction('home')` | ❌ Not implementable | — |
| `openApp(bundleId)` | `UIApplication.shared.open(URL(string: scheme + "://"))` — URL scheme only | Low |
| `getInstalledApps()` | Return empty array (no public API) | Low (stub) |
| `takeScreenshot()` | `UIScreen.main.snapshotView(afterScreenUpdates:)` — own app only | Low (limited) |
| `showOverlay()` | `UIWindow` with `.windowLevel = .statusBar + 1` — own app only | Medium |
| `isServiceEnabled()` | Check AXRuntime entitlement availability; return false if absent | Low |
| `onAccessibilityEvent()` | `AXObserver` on focused app process — limited event types | High |
| `canDrawOverlays()` | Always true (within own app); always false (over other apps) | Low (stub) |

**Estimated total effort**: 6–10 weeks for one experienced iOS/React Native engineer, not counting the Apple entitlement approval process (timeline unknown, typically 2–8 weeks of back-and-forth).

**Prerequisite**: Apple entitlement approval. Without it, the implementation can be built and tested on development devices using development provisioning, but cannot ship to any user.

### Watch list

- **iOS 18 / 19 accessibility improvements**: Apple has been steadily expanding App Intents as a controlled automation surface. If Apple ever allows third-party apps to publish intents that expose their full UI tree (similar to how Shortcuts already expose some actions), a lightweight integration path becomes possible without AXRuntime.
- **Apple Intelligence infrastructure (iOS 18+)**: Apple Intelligence uses on-device models to perform actions across apps. The system-level hooks it uses are not public, but Apple's design philosophy suggests they may eventually expose a controlled automation API for third parties — similar to how Shortcuts expanded after Siri Shortcuts.

**Reference**: [App Intents — Apple Developer](https://developer.apple.com/documentation/appintents)

---

## References

1. [UIAccessibility Framework — Apple Developer Documentation](https://developer.apple.com/documentation/uikit/uiaccessibility)
2. [App Store Review Guidelines 2.5.1 — Private APIs](https://developer.apple.com/app-store/review/guidelines/#software-requirements)
3. [Apple Developer Enterprise Program](https://developer.apple.com/programs/enterprise/)
4. [Mobile Device Management Protocol Reference — Apple](https://developer.apple.com/documentation/devicemanagement)
5. [AXUIElement Reference (macOS, same ABI as iOS AXRuntime)](https://developer.apple.com/documentation/applicationservices/axuielement-h)
6. [App Intents — Apple Developer](https://developer.apple.com/documentation/appintents)
7. [Autonomous Single App Mode — Apple MDM Guide](https://support.apple.com/guide/deployment/autonomous-single-app-mode-dep932e7ae1d/web)
8. [AccessibilitySnapshot (open-source AXRuntime surface exploration)](https://github.com/cashapp/AccessibilitySnapshot)
