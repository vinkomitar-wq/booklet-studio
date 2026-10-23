/** Fotografije stranica „photos": zapis u knjižici nosi samo id, slika je zasebno (inače knjižica prelazi granicu veličine dokumenta). Čisto. */
import type { BookletDraft } from './booklet';

export const isPhotoId = (ref: string): boolean => /^ph[A-Za-z0-9_-]+$/.test(ref) && !ref.startsWith('data:');

export const newPhotoId = (taken: Record<string, unknown> = {}): string => {
  let id = '';
  do id = `ph${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  while (id in taken);
  return id;
};

/** Slika za prikaz: spremljena fotografija po id-u; stari zapis nosi samo data: adresu u samom `ref`-u. */
export const photoSrc = (photos: Record<string, string>, ref: string): string => photos[ref] ?? (ref.startsWith('data:image/') ? ref : '');

/** Stare fotografije stranica (data: adresa u `ref`) → id + zasebna slika. Čisto; vraća ISTE objekte kad nema promjene. */
export function externalizePhotos(draft: BookletDraft, photos: Record<string, string>): { draft: BookletDraft; photos: Record<string, string> } {
  let changed = false;
  const out = { ...photos };
  const byData = new Map<string, string>();
  for (const [id, url] of Object.entries(out)) byData.set(url, id);
  const pages = draft.pages.map((p) => {
    if (p.type !== 'photos') return p;
    let pc = false;
    const items = p.items.map((it) => {
      if (!it.ref.startsWith('data:image/')) return it;
      let id = byData.get(it.ref);
      if (!id) {
        id = newPhotoId(out);
        out[id] = it.ref;
        byData.set(it.ref, id);
      }
      pc = true;
      return { ...it, ref: id };
    });
    if (!pc) return p;
    changed = true;
    return { ...p, items };
  });
  return changed ? { draft: { ...draft, pages }, photos: out } : { draft, photos };
}

/** Obrnuto, za sigurnosnu kopiju: svaka fotografija natrag kao data: adresa, pa je datoteka samostalna. */
export function inlinePhotos(draft: BookletDraft, photos: Record<string, string>): BookletDraft {
  return {
    ...draft,
    pages: draft.pages.map((p) => (p.type === 'photos' ? { ...p, items: p.items.map((it) => ({ ...it, ref: photoSrc(photos, it.ref) || it.ref })) } : p)),
  };
}

/** Samo fotografije koje stranice stvarno koriste (ostalo je smeće koje se ne sprema ni šalje). */
export function usedPhotos(draft: BookletDraft, photos: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of draft.pages) if (p.type === 'photos') for (const it of p.items) if (photos[it.ref]) out[it.ref] = photos[it.ref];
  return out;
}

