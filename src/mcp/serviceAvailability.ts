import { useSyncExternalStore } from 'react';

let available = false;
const listeners = new Set<() => void>();

export const getMcpServiceAvailable = () => available;

export function setMcpServiceAvailable(value: boolean): void {
  if (available === value) return;
  available = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useMcpServiceAvailable(): boolean {
  return useSyncExternalStore(subscribe, getMcpServiceAvailable, () => false);
}
