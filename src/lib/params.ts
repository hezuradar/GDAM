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

/**
 * Digits-only phone in international format for wa.me links: the "00" prefix is stripped and
 * 7–15 digits are required (E.164). A local number without country code would open a chat with
 * the wrong contact, so it is rejected instead of guessed.
 */
export function whatsappDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return /^\d{7,15}$/.test(digits) && !digits.startsWith('0') ? digits : null;
}

export function whatsappUrl(phone: string, text: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  const trimmed = text.trim();
  // An empty ?text= opens the chat with a blank pre-filled message; better no parameter at all.
  return trimmed ? `https://wa.me/${digits}?text=${encodeURIComponent(trimmed)}` : `https://wa.me/${digits}`;
}

/**
 * Internal in-app path to return to after an intermediate screen (e.g. creating a supplier
 * in the middle of a new order). Anything that is not a simple internal route is ignored.
 */
export function safeReturnPath(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\/[A-Za-z0-9\-_/]*$/.test(raw) ? raw : null;
}

export function trackingUrl(trackingNumber: string): string {
  return `https://t.17track.net/es#nums=${encodeURIComponent(trackingNumber.trim())}`;
}
