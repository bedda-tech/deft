/**
 * Registers the resource fetcher for react-native-executorch. Imported first in
 * index.ts: ES imports are hoisted, so a call inside index.ts would run after App's
 * module graph, and executorch hooks there would fail with "adapter is not initialized".
 * Must be a static import: the fetcher's package.json exports only the "import"
 * condition, so require() resolves to undefined under Metro.
 */
import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

// Pairing (#18769): the fork is upstream 31bdd99c74 (v0.9.0) plus 17 Gemma 4 commits, and its
// ResourceFetcherAdapter has no fetch() on the fetcher class. fetcher 0.9.0 extends
// BaseResourceFetcherClass, which the fork does not export (it arrived upstream in the
// rne-rewrite line, 1dcc58bfb9). No published executorch matches both the fork's Gemma 4
// constants and that class, so the cast stays until one side changes. Not published.
initExecutorch({ resourceFetcher: ExpoResourceFetcher as unknown as Parameters<typeof initExecutorch>[0]['resourceFetcher'] });
