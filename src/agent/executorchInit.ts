/**
 * Registers the resource fetcher for react-native-executorch. Imported first in
 * index.ts: ES imports are hoisted, so a call inside index.ts would run after App's
 * module graph, and executorch hooks there would fail with "adapter is not initialized".
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initExecutorch } = require('react-native-executorch');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher');

initExecutorch({ resourceFetcher: ExpoResourceFetcher });
