import qrcode from 'qrcode-generator';

/** QR kod kao matrica (true = tamni modul), ili null kad se tekst ne da kodirati. Na slikama poveznice nisu klikabilne, pa QR vodi na web. */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  } catch {
    return null;
  }
}
