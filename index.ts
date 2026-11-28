import './src/agent/executorchInit';
import { registerRootComponent } from 'expo';

// Hooks such as useLLM/useSpeechToText load models directly, so the resource
// fetcher must be set before any of them run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { initExecutorch } = require('react-native-executorch');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ExpoResourceFetcher } = require('react-native-executorch-expo-resource-fetcher');
initExecutorch({ resourceFetcher: ExpoResourceFetcher });

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
