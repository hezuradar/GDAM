import { useSyncExternalStore } from 'react';
import { CURRENCIES, type Currency } from '@/domain/types';

/** null = show each order in its own currency. */
export type DisplayCurrency = Currency | null;

const STORAGE_KEY = 'compras.displayCurrency';
const listeners = new Set<() => void>();

function read(): DisplayCurrency {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return CURRENCIES.find((c) => c === stored) ?? null;
  } catch {
    return null; // storage blocked (private mode…): fall back to original currencies
  }
}

let current: DisplayCurrency = typeof window === 'undefined' ? null : read();

export function setDisplayCurrency(value: DisplayCurrency): void {
  current = value;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted, still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Changes made in another tab also update this one.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    current = read();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Display currency chosen by the user, shared by every screen and remembered on this device. */
export function useDisplayCurrency(): DisplayCurrency {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
