import { describe, expect, it } from 'vitest';
import {
  detectLocalLLMRuntimeSupport,
  formatLocalLLMContextLength,
  LOCAL_LLM_DEFAULT_CONTEXT_LENGTH,
  normalizeLocalLLMContextLength,
} from './localLLMConfig';

describe('localLLMConfig', () => {
  it('defaults invalid context lengths to 32768', () => {
    expect(normalizeLocalLLMContextLength(undefined)).toBe(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
    expect(normalizeLocalLLMContextLength(12345)).toBe(LOCAL_LLM_DEFAULT_CONTEXT_LENGTH);
  });

  it('formats context lengths using k suffixes', () => {
    expect(formatLocalLLMContextLength(32768)).toBe('32k');
    expect(formatLocalLLMContextLength(65536)).toBe('64k');
    expect(formatLocalLLMContextLength(131072)).toBe('128k');
  });

  it('marks insecure contexts as unsupported', () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    Object.defineProperty(window, 'crossOriginIsolated', { value: true, configurable: true });
    Object.defineProperty(globalThis, 'SharedArrayBuffer', { value: class SharedArrayBuffer {}, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: {} }, configurable: true });

    const support = detectLocalLLMRuntimeSupport();

    expect(support.supported).toBe(false);
    expect(support.reason).toContain('secure context');
  });

  it('marks missing WebGPU as unsupported', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(window, 'crossOriginIsolated', { value: true, configurable: true });
    Object.defineProperty(globalThis, 'SharedArrayBuffer', { value: class SharedArrayBuffer {}, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

    const support = detectLocalLLMRuntimeSupport();

    expect(support.supported).toBe(false);
    expect(support.reason).toContain('WebGPU');
  });

  it('allows runtime attempts when only SharedArrayBuffer isolation support is missing', () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(window, 'crossOriginIsolated', { value: false, configurable: true });
    Object.defineProperty(globalThis, 'SharedArrayBuffer', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'navigator', { value: { gpu: {} }, configurable: true });

    const support = detectLocalLLMRuntimeSupport();

    expect(support.supported).toBe(true);
    expect(support.reason).toContain('cross-origin isolation');
  });
});
