/** Izvoz knjižice: složi samostalnu .html datoteku, preuzmi je ili podijeli preko sustava uređaja (WhatsApp, LINE, e-pošta…). */
import { BookletBuildInput, bookletFileName, buildBookletHtml } from './booklet';

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
