// @ts-check
const { withAndroidManifest, withDangerousMod, withAppBuildGradle } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin: adds the DeftAgentService foreground service to the Android build.
 *
 * What it does on `expo prebuild`:
 *   1. Adds FOREGROUND_SERVICE (+ FOREGROUND_SERVICE_SPECIAL_USE on API 34+) permissions.
 *   2. Declares DeftAgentService in AndroidManifest.xml.
 *   3. Copies DeftAgentService.kt / DeftAgentModule.kt / DeftAgentPackage.kt into the
 *      generated android/app/src/main/java/tech/bedda/deft/ directory.
 *   4. Patches MainApplication.kt to register DeftAgentPackage.
 */

// ─── Step 1: AndroidManifest.xml ─────────────────────────────────────────────

function withManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Permissions
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const perms = manifest['uses-permission'];

    const ensurePerm = (name, extra) => {
      if (!perms.some((p) => p.$['android:name'] === name)) {
        perms.push({ $: { 'android:name': name, ...extra } });
      }
    };

    ensurePerm('android.permission.FOREGROUND_SERVICE');
    ensurePerm('android.permission.FOREGROUND_SERVICE_SPECIAL_USE', {
      'android:minSdkVersion': '34',
    });

    // Service declaration
    const app = manifest.application[0];
    if (!app.service) app.service = [];

    const serviceExists = app.service.some(
      (s) => s.$['android:name'] === '.DeftAgentService',
    );
    if (!serviceExists) {
      app.service.push({
        $: {
          'android:name': '.DeftAgentService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
        'property': [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'agent_task',
            },
          },
        ],
      });
    }

    return cfg;
  });
}

// ─── Step 2 & 3: Copy Kotlin files + patch MainApplication.kt ────────────────

function withKotlinFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot; // …/android
      const packageDir = path.join(
        projectRoot,
        'app', 'src', 'main', 'java', 'tech', 'bedda', 'deft',
      );
      const pluginAndroidDir = path.join(
        cfg.modRequest.projectRoot,
        'plugins', 'android',
      );

      fs.mkdirSync(packageDir, { recursive: true });

      for (const file of [
        'DeftAgentService.kt',
        'DeftAgentModule.kt',
        'DeftAgentPackage.kt',
        'DeftWatchdogModule.kt',
      ]) {
        fs.copyFileSync(
          path.join(pluginAndroidDir, file),
          path.join(packageDir, file),
        );
      }

      // Patch MainApplication.kt to register DeftAgentPackage
      const mainAppPath = path.join(packageDir, 'MainApplication.kt');
      if (fs.existsSync(mainAppPath)) {
        let src = fs.readFileSync(mainAppPath, 'utf8');

        // Add package registration inside getPackages() if not already present
        if (!src.includes('DeftAgentPackage')) {
          // Try the standard Expo-generated comment placeholder
          src = src.replace(
            /\/\/ Packages that cannot be autolinked yet[^\n]*/,
            '// Packages that cannot be autolinked yet can be added manually here, for example:\n      add(DeftAgentPackage())',
          );

          // Fallback: insert before the closing brace of the apply block inside getPackages
          if (!src.includes('DeftAgentPackage')) {
            src = src.replace(
              /PackageList\(this\)\.packages\.apply \{/,
              'PackageList(this).packages.apply {\n      add(DeftAgentPackage())',
            );
          }

          fs.writeFileSync(mainAppPath, src, 'utf8');
        }
      }

      return cfg;
    },
  ]);
}

// ─── Step 4: Enforce minSdkVersion 26 ────────────────────────────────────────
// Expo SDK 50+ dropped android.minSdkVersion from app.json — set it via
// withAppBuildGradle so the manifest merger accepts react-native-accessibility-controller.

function withMinSdkVersion26(config) {
  return withAppBuildGradle(config, (cfg) => {
    // Expo 54 template: minSdk Integer.parseInt(findProperty('android.minSdkVersion') ?: '24')
    // Bump the fallback default to 26; respects ANDROID_MIN_SDK_VERSION env override if set.
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /(minSdk(?:Version)?(?:\s*=\s*|\s+)Integer\.parseInt\(findProperty\('android\.minSdkVersion'\)\s*\?:\s*')(\d+)('\))/,
      (_, pre, val, post) => `${pre}${Math.max(parseInt(val, 10), 26)}${post}`
    );
    return cfg;
  });
}

// ─── Compose ──────────────────────────────────────────────────────────────────

/** @type {(config: import('@expo/config-plugins').ExpoConfig) => import('@expo/config-plugins').ExpoConfig} */
const withDeftForegroundService = (config) => {
  config = withManifest(config);
  config = withKotlinFiles(config);
  config = withMinSdkVersion26(config);
  return config;
};

module.exports = withDeftForegroundService;
