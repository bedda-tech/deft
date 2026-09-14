# F-Droid submission — status and runbook

**Status as of 2026-09-14: prepared, not submitted.** The recipe in
[`.fdroid.yml`](../.fdroid.yml) is accurate for v1.4.5 and the store listing under
`fastlane/metadata/android/en-US/` is complete, but the app **cannot build in
F-Droid's sandbox yet**. Four things block the merge request. Opening it before
they clear would put a recipe in front of F-Droid's build bot that fails on the
first step, which burns review-queue goodwill for no gain.

This document is the runbook: what is blocked, who can unblock it, and the exact
commands to run once it is unblocked.

---

## What F-Droid actually requires

F-Droid does not accept an APK. It clones the source repo **on its own build
server, in an isolated sandbox with only the declared repo present**, builds it
from source with its own toolchain, and signs the result itself. Anything the
build needs must be fetchable from inside that sandbox.

Submission is a **merge request on GitLab** (`fdroiddata`), not a GitHub PR:
<https://gitlab.com/fdroid/fdroiddata/>. The file added is
`metadata/tech.bedda.deft.yml` — the same content as our `.fdroid.yml`, minus the
`disable:` line.

---

## Blocker 1 — three dependencies are `file:../` paths (hard blocker)

`package.json` depends on three sibling repos by relative path:

```json
"react-native-accessibility-controller": "file:../react-native-accessibility-controller",
"react-native-device-agent":             "file:../react-native-device-agent",
"react-native-executorch":               "file:../react-native-executorch/packages/react-native-executorch"
```

A fresh single-repo checkout has no `../react-native-*` siblings, so `npm ci`
fails immediately and `expo prebuild` never runs.

**Fix:** publish all three to npm and repoint `package.json` at the published
versions. Publishing is itself blocked — see Blocker 2.

*(The alternative, F-Droid `srclibs` that clone the sibling repos into place
pre-build, is supported by the tooling but is nonstandard for JS dependencies and
would need per-release version pinning by hand. Only worth it if npm publishing
stays blocked indefinitely.)*

## Blocker 2 — npm publishing needs a human (hard blocker, needs Matt)

Verified again 2026-09-14: `npm whoami` → `ENEEDAUTH`, and `npm view` returns 404
for `react-native-device-agent`, `react-native-accessibility-controller`,
`@bedda-tech/react-native-device-agent` and `@bedda-tech/react-native-executorch`.
Nothing has been published.

Both library repos already have a correct `publish.yml`
(typecheck → build → `npm publish --provenance --access public`), gated on
`secrets.NPM_TOKEN`. **The only missing piece is the token**: someone has to
create/use an npmjs.com account (ideally an `bedda-tech` npm org), enable 2FA and
generate an *Automation* token. npm's signup and 2FA flow is not automatable by an
agent. Once the token value exists, the rest is scriptable:

```bash
gh secret set NPM_TOKEN --repo bedda-tech/react-native-accessibility-controller
gh secret set NPM_TOKEN --repo bedda-tech/react-native-device-agent
git -C react-native-accessibility-controller tag v1.4.0 && git -C react-native-accessibility-controller push origin v1.4.0
git -C react-native-device-agent            tag v1.2.0 && git -C react-native-device-agent            push origin v1.2.0
```

**Name decision still open for executorch.** `react-native-executorch` is Software
Mansion's actively-maintained upstream package (v0.9.3 on npm); our fork is a
modified 0.9.0. Publishing the fork under that name is impossible (taken) and
would be a dependency-confusion hazard anyway. It must be renamed — proposed
`@bedda-tech/react-native-executorch` — before it can be published, and
`package.json` plus every `import` path updated to match.

## Blocker 3 — prebuilt native binaries in the executorch fork (needs work)

F-Droid's scanner rejects binary blobs committed to source (`.so`, `.a`, `.jar`,
`.aar`) and will flag them during review. The executorch fork carries ~137 MB of
them:

- `third-party/ios/libs/executorch/*.a` — 20+ prebuilt iOS static libs
- `android/libs/classes.jar`
- `common/rnexecutorch/tests/integration/libs/libfbjni.so`

The iOS `.a` files are dead weight for an Android-only F-Droid build and are the
easy half — they can be excluded from the published npm tarball via `files`/
`.npmignore`, which also removes them from what F-Droid's scanner sees. The
Android `classes.jar` and the ExecuTorch native runtime need either a source
build in the recipe or an explicit `Scanner` exemption argued in the MR. Neither
is a blocker to *writing* the recipe, but both will come up in review, so have the
answer ready.

## Blocker 4 — anti-features must be declared (done in `.fdroid.yml`)

The old recipe claimed `AntiFeatures: []`. That is wrong and a reviewer would
catch it:

- **`NonFreeAssets`** — Gemma 4 weights are downloaded on first run from
  `https://huggingface.co/bedda-tech/react-native-executorch` and are covered by
  the Gemma Terms of Use, not an OSI-approved licence.
- **`NonFreeNet`** — the optional cloud fallback talks to OpenAI / Anthropic /
  OpenRouter when the user supplies an API key
  (`src/agent/agentBridge.ts`, `src/agent/watchdogBridge.ts`).

Both are now declared. Declaring them is normal and does not disqualify the app;
hiding them does.

---

## Runbook — once Blockers 1–3 clear

1. Bump `app.json` → `expo.version` and `expo.android.versionCode`, tag the
   release, and confirm the Release workflow attached an APK.
2. Add `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`. **The file
   name is the versionCode, not the versionName** — the old `10000.txt` matched
   nothing and was removed on 2026-09-14; v1.4.5 is versionCode `10`.
3. Update `.fdroid.yml`: `versionName`, `versionCode`, `commit: v<version>`,
   `CurrentVersion`, `CurrentVersionCode`. Remove the `disable:` line.
4. Dry-run the build locally against F-Droid's own tooling before submitting:
   ```bash
   git clone https://gitlab.com/fdroid/fdroiddata.git && cd fdroiddata
   cp ../deft/.fdroid.yml metadata/tech.bedda.deft.yml   # strip the `disable:` line
   fdroid readmeta && fdroid lint tech.bedda.deft
   fdroid build -v -l tech.bedda.deft                    # needs docker/vagrant buildserver
   ```
   `fdroid lint` catching a field-name typo here costs minutes; the build bot
   catching it costs a review cycle.
5. Fork `fdroiddata` on GitLab, commit `metadata/tech.bedda.deft.yml` on a branch
   named `tech.bedda.deft`, push, open the MR against `master`. Title:
   `New app: Deft (tech.bedda.deft)`.
6. Expect a reviewer to ask about the anti-features and the bundled binaries.
   Approval typically takes 1–2 weeks and often one round of changes.

## Verification checklist before opening the MR

- [ ] `npm view react-native-accessibility-controller version` returns a version
- [ ] `npm view react-native-device-agent version` returns a version
- [ ] `npm view @bedda-tech/react-native-executorch version` returns a version
- [ ] `package.json` contains no `file:` dependency
- [ ] `git clone` of deft alone + `npm ci` + `npx expo prebuild --platform android`
      succeeds in an empty directory
- [ ] `fdroid lint tech.bedda.deft` is clean
- [ ] `versionName` / `versionCode` / `commit` in the recipe match a tag that
      exists on GitHub
- [ ] a changelog file named `<versionCode>.txt` exists

## Related

- [`.fdroid.yml`](../.fdroid.yml) — the recipe itself
- [`docs/producthunt.md`](producthunt.md) — launch checklist that tracks this item
- [`docs/ios-investigation.md`](ios-investigation.md) — the other distribution dead end
