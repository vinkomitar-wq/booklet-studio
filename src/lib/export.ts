/** Izvoz knjižice: složi samostalnu .html datoteku, preuzmi je ili podijeli preko sustava uređaja (WhatsApp, LINE, e-pošta…). */
import { BookletBuildInput, bookletFileName, buildBookletHtml } from './booklet';
import { makeZip } from './zip';

export interface Prepared {
  html: string;
  fileName: string;
  bytes: number;
}

export function prepare(input: BookletBuildInput): Prepared {
  const html = buildBookletHtml(input);
  return { html, fileName: bookletFileName(input.draft.title), bytes: new Blob([html]).size };
}

export function downloadFile(name: string, text: string, type = 'text/html;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type ShareResult = 'shared' | 'cancelled' | 'unsupported';

/** Sistemski izbornik dijeljenja s PRIVITKOM. Bez podrške za datoteke vraća 'unsupported' — sučelje tada kaže „preuzmi pa priloži". */
export async function shareFile(p: Prepared, title: string, text: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    const file = new File([p.html], p.fileName, { type: 'text/html' });
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files: [file] })) return 'unsupported';
    await nav.share({ files: [file], title, text });
    return 'shared';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported'; // zatvaranje izbornika nije greška
  }
}

/** Ime bez nastavka za slike i ZIP (npr. „My-booklet"). */
export const baseName = (title: string): string => bookletFileName(title).replace(/\.html$/, '');

export function pictureFiles(blobs: Blob[], title: string): File[] {
  const base = baseName(title);
  const pad = String(blobs.length).length;
  return blobs.map((b, i) => new File([b], `${base}-${String(i + 1).padStart(Math.max(2, pad), '0')}.jpg`, { type: 'image/jpeg' }));
}

/** Slike u sustavni izbornik dijeljenja (WhatsApp/LINE ih pošalju kao album). Bez podrške za datoteke: 'unsupported' — sučelje tada nudi ZIP. */
export async function sharePictures(files: File[], title: string, text: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || !nav.canShare({ files })) return 'unsupported';
    await nav.share({ files, title, text });
    return 'shared';
  } catch (e) {
    return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

export async function zipPictures(files: File[]): Promise<Blob> {
  const data = await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
  return new Blob([makeZip(data)], { type: 'application/zip' });
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Ispis slike na cijeli list (A4 ili A5, bez margina) preko skrivenog okvira. Poziva se iz klika, a slika je već nacrtana, pa preglednik ispis ne blokira.
 * Vraća false ako preglednik ispis ne može pokrenuti — sučelje tada kaže da sliku spremi i ispiše iz galerije.
 */
export function printPicture(blob: Blob, paper: 'A4' | 'A5'): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>Print</title><style>@page{size:${paper};margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:100vw;height:100vh;object-fit:contain}</style></head><body><img src="${url}" alt=""></body></html>`;
    frame.onload = () => {
      const w = frame.contentWindow;
      const img = frame.contentDocument?.querySelector('img');
      const go = () => {
        try {
          w?.focus();
          w?.print();
        } finally {
          window.setTimeout(() => {
            frame.remove();
            URL.revokeObjectURL(url);
          }, 60_000);
        }
      };
      if (img && !img.complete) img.onload = go;
      else go();
    };
    document.body.appendChild(frame);
    return true;
  } catch {
    return false;
  }
}

/** Jedna slika u izbornik dijeljenja (WhatsApp, LINE…). */
export async function shareOnePicture(file: File, title: string, text: string): Promise<ShareResult> {
  return sharePictures([file], title, text);
}
