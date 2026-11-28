/**
 * Registers the resource fetcher for react-native-executorch. Imported first in
 * index.ts: ES imports are hoisted, so a call inside index.ts would run after App's
 * module graph, and executorch hooks there would fail with "adapter is not initialized".
 * Must be a static import: the fetcher's package.json exports only the "import"
 * condition, so require() resolves to undefined under Metro.
 */
import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

initExecutorch({ resourceFetcher: ExpoResourceFetcher });
