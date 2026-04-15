/**
 * Onboarding persistence store.
 *
 * Stores whether the user has completed onboarding using AsyncStorage.
 * Requires @react-native-async-storage/async-storage as a peer dependency.
 *
 * Install:
 *   npx expo install @react-native-async-storage/async-storage
 */

const ONBOARDING_KEY = '@deft/onboarding_complete';

/**
 * Minimal AsyncStorage shape we depend on.
 * Lets us type-check without the package installed -- the real package
 * satisfies this interface at runtime.
 */
interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function getStorage(): AsyncStorageLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-async-storage/async-storage').default as AsyncStorageLike;
  } catch {
    // In environments without the native module (e.g., unit tests or web),
    // fall back to an in-memory store so the app doesn't crash.
    const mem: Record<string, string> = {};
    return {
      async getItem(key: string) { return mem[key] ?? null; },
      async setItem(key: string, value: string) { mem[key] = value; },
    };
  }
}

/**
 * Check whether the user has already completed onboarding.
 */
export async function isOnboardingComplete(): Promise<boolean> {
  const value = await getStorage().getItem(ONBOARDING_KEY);
  return value === 'true';
}

/**
 * Mark onboarding as complete. Call this on the final "Ready" screen.
 */
export async function completeOnboarding(): Promise<void> {
  await getStorage().setItem(ONBOARDING_KEY, 'true');
}

/**
 * Reset onboarding state (useful for testing / settings reset).
 */
export async function resetOnboarding(): Promise<void> {
  await getStorage().setItem(ONBOARDING_KEY, 'false');
}
