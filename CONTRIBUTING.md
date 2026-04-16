# Contributing to Deft

Deft is an open-source, on-device AI phone agent for Android. Contributions of all kinds are welcome — bug reports, feature ideas, code, and docs.

## Ways to Contribute

- **Report bugs** — open a GitHub issue with steps to reproduce
- **Request features** — open a GitHub issue describing what you need and why
- **Fix issues** — look for `good first issue` labels to find beginner-friendly tasks
- **Improve docs** — fix typos, clarify setup steps, add usage examples
- **Test on devices** — on-device behavior varies; real-device testing is high-value

## Community

- [Discord](https://discord.gg/deft) — chat with maintainers and contributors
- [GitHub Discussions](https://github.com/bedda-tech/deft/discussions) — design proposals and Q&A

## Development Setup

Requirements:
- Node.js 20+, npm
- Android device or emulator (API 30+) with developer mode enabled
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

```bash
git clone https://github.com/bedda-tech/deft.git
cd deft
npm install
npx expo start --android
```

On first run, the app will prompt you to enable the Deft AccessibilityService and download the Gemma 4 model (~2.5 GB). Test onboarding changes on a real device — emulators skip some accessibility flows.

## Code Guidelines

- TypeScript strict throughout — no `any`, no type assertions without a comment explaining why
- All state goes through Zustand stores; keep side effects in `services/agent.ts`
- Expo Router for navigation — new screens go under `app/`
- Run `npx tsc --noEmit` before opening a PR; it must exit 0

## Pull Request Process

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b fix/issue-123-describe-your-change
   ```
2. Make your changes and test on device
3. Run `npx tsc --noEmit` — must pass with no errors
4. Push and open a PR against `main`
5. Describe what changed and why; link the related issue

Please open an issue before starting large features to avoid duplicate work.

## Related Repos

- [react-native-accessibility-controller](https://github.com/bedda-tech/react-native-accessibility-controller) — screen reading, gestures, global actions
- [react-native-device-agent](https://github.com/bedda-tech/react-native-device-agent) — agent loop and LLM providers
- [react-native-executorch](https://github.com/bedda-tech/react-native-executorch) — on-device Gemma 4 inference

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
