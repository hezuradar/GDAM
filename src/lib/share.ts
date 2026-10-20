import * as Clipboard from 'expo-clipboard';
import { announce, showMessage } from '@/components/ui/alerts';

/**
 * Shares text with the browser share sheet when available (mobile browsers);
 * otherwise copies it to the clipboard.
 */
export async function shareText(text: string, title: string): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return; // user closed the sheet
    }
  }
  await Clipboard.setStringAsync(text);
  announce('Copiado al portapapeles');
  showMessage('Copiado', 'El texto se ha copiado al portapapeles. Pégalo donde quieras.');
}

/**
 * Saves a text file. On phones that can share files (iOS/Android) the share sheet lets the user
 * pick Files, Drive, mail…; elsewhere the file is downloaded.
 */
export async function saveTextFile(text: string, fileName: string, title: string): Promise<void> {
  const canDownload =
    typeof File !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function' &&
    typeof document !== 'undefined';
  if (!canDownload) {
    throw new Error('Este navegador no permite descargar archivos. Usa Chrome o Firefox, o ábrelo en el ordenador.');
  }
  const file = new File([text], fileName, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ title, files: [file] });
      return;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
