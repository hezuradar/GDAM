const LIVE_REGION_ID = 'a11y-announcer';

/** Visually hidden aria-live region shared by the whole app (screen readers read its changes). */
function liveRegion(): HTMLElement {
  const existing = document.getElementById(LIVE_REGION_ID);
  if (existing) return existing;
  const region = document.createElement('div');
  region.id = LIVE_REGION_ID;
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('role', 'status');
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  });
  document.body.appendChild(region);
  return region;
}

/** Announces a message to VoiceOver / TalkBack / NVDA. */
export function announce(message: string): void {
  const region = liveRegion();
  region.textContent = '';
  // A tick later so the same message twice is still announced.
  window.setTimeout(() => {
    region.textContent = message;
  }, 50);
}

/** Announces the first validation error, if any. Returns true when the form is valid. */
export function announceErrors(errors: Record<string, string | undefined>): boolean {
  const first = Object.values(errors).find(Boolean);
  if (first) announce(`Revisa el formulario: ${first}`);
  return !first;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado';
}

export function showMessage(title: string, message: string): void {
  window.alert(`${title}\n\n${message}`);
}

export function showError(title: string, error: unknown): void {
  showMessage(title, errorMessage(error));
}

type ConfirmOptions = { title: string; message: string; confirmLabel: string; onConfirm: () => void };

/** Destructive confirmation with the browser dialog (Cancel is the safe default). */
export function confirmDestructive({ title, message, onConfirm }: ConfirmOptions): void {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
