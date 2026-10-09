/** Translate availability/fallback messages while preserving backend identifiers. */
export function runtimeProviderLabel(provider: string, t: (key: string) => string): string {
  const keys: Record<string, string> = {
    'webgpu available': 'runtimeProvider.webgpuAvailable',
    'cpu/wasm only': 'runtimeProvider.cpuOnly',
    'cpu/wasm fallback': 'runtimeProvider.cpuFallback',
  };
  return keys[provider] ? t(keys[provider]) : provider;
}
