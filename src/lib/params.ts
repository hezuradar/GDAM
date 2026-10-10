import { router } from 'expo-router';

/**
 * router.back() is a no-op when the screen was opened directly (deep link, web reload),
 * so fall back to the tabs root.
 */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Route params come from URLs (deep links), so they are validated before use. */
export function parseIdParam(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/** Digits-only phone for wa.me links; null when too short to be a real number. */
export function whatsappDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 ? digits : null;
}

export function whatsappUrl(phone: string, text: string): string | null {
  const digits = whatsappDigits(phone);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export function trackingUrl(trackingNumber: string): string {
  return `https://t.17track.net/es#nums=${encodeURIComponent(trackingNumber.trim())}`;
}
