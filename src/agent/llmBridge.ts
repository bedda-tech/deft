/**
 * LLM bridge: singleton registration point for on-device inference functions.
 *
 * react-native-executorch exposes LLM inference through an async class
 * (LLMModule) that must be initialized with a model file. It cannot be used
 * directly from non-React code like agentBridge.ts because initialization is
 * async and happens at app startup.
 *
 * Pattern:
 *   1. App.tsx initializes LLMModule and registers the generate functions here.
 *   2. agentBridge.ts reads the registered functions when building a GemmaProvider.
 *   3. If executorch is not linked or model is not downloaded, the functions
 *      remain null and agentBridge falls back to cloud or stub.
 */

type GenerateFn = (prompt: string) => Promise<string>;
type GenerateWithImageFn = (prompt: string, imagePath: string) => Promise<string>;

let _generateFn: GenerateFn | null = null;
let _generateWithImageFn: GenerateWithImageFn | null = null;

/** Register the on-device text generation function. */
export function registerGenerateFn(fn: GenerateFn): void {
  _generateFn = fn;
}

/** Register the on-device vision generation function (optional). */
export function registerGenerateWithImageFn(fn: GenerateWithImageFn): void {
  _generateWithImageFn = fn;
}

/** Returns the registered text generation function, or null if not available. */
export function getGenerateFn(): GenerateFn | null {
  return _generateFn;
}

/** Returns the registered vision generation function, or null if not available. */
export function getGenerateWithImageFn(): GenerateWithImageFn | null {
  return _generateWithImageFn;
}

/** True if an on-device LLM has been registered and is ready to use. */
export function isOnDeviceLLMReady(): boolean {
  return _generateFn !== null;
}

/** Clear registered functions (e.g., when model is unloaded). */
export function unregisterLLM(): void {
  _generateFn = null;
  _generateWithImageFn = null;
}
