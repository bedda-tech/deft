# Security Policy

## Supported Versions

We actively maintain security fixes for the latest release. Older versions do not receive backported patches.

| Version | Supported |
| ------- | --------- |
| latest  | ✓         |

## Reporting a Vulnerability

If you discover a security vulnerability in Deft, **please do not open a public GitHub issue.**

Instead, email **security@bedda.tech** with:

- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code is welcome)
- The versions and Android API levels you have tested against

We will acknowledge your report within **48 hours** and aim to release a fix within **14 days** of confirmation.

We do not currently offer a bug bounty program, but we will credit researchers in the release notes unless they request anonymity.

## Security Considerations

Deft is an AI phone agent with elevated system privileges. Users and contributors should be aware of:

- **Accessibility Service**: Deft uses Android's `AccessibilityService` to read and interact with all apps on the device. This is disclosed to users during onboarding. Screen data is processed entirely on-device by the local AI model and is never transmitted to a remote server (unless the optional cloud fallback is explicitly enabled by the user).
- **System Alert Window**: the agent-status overlay requires the `SYSTEM_ALERT_WINDOW` permission to display over other apps. This permission is requested during onboarding.
- **Cloud API keys**: if a user enables the cloud fallback and enters an API key, the key is stored in AsyncStorage. Do not log or transmit the key. Future versions will migrate to Android Keystore.
- **Prompt injection**: because the agent reads arbitrary screen content, a malicious app could embed instructions designed to manipulate the agent. Deft includes a system prompt that establishes agent boundaries, but no mitigation is foolproof. Users should supervise agent sessions and use the Stop button if the agent behaves unexpectedly.
