/**
 * Usklađivanje podataka između uređaja (čisto, bez preglednika i bez Firebasea — pod testom).
 *
 * Svaka stavka, letak, fotografija stranice, knjižica, postavke i redoslijed je JEDAN zapis (`Rec`). Zapis ima otisak (hash) sadržaja.
 * Uređaj pamti otisak zadnje usklađene verzije (`Meta.hashes`): zapis je „lokalno izmijenjen" ako se njegov otisak razlikuje.
 *  – povlačenje: samo ono što je na poslužitelju novije od `since`; lokalno izmijenjeno se NE gazi (pobjeđuje lokalno)
 *  – slanje: samo lokalno izmijenjeno; obrisano lokalno ide kao „nadgrobna oznaka" (`deleted`), ne kao pravo brisanje
 * Poslužitelj se zapravo čita rijetko: nema slušatelja, samo upit „što je novo od…".
 */
import { BookletDraft, normalizeDraft, type BookletLang } from './booklet';
import { Flyer, normalizeFlyers } from './flyer';
import { Item, Settings, normalizeItems, normalizeSettings } from './studio';
import { externalizePhotos, inlinePhotos, isPhotoId, newPhotoId, photoSrc, usedPhotos } from './photoRef';

export type Kind = 'item' | 'flyer' | 'photo' | 'draft' | 'settings' | 'order';
export const KINDS: Kind[] = ['item', 'flyer', 'photo', 'draft', 'settings', 'order'];

export interface Rec {
  kind: Kind;
  /** Siguran id (samo slova, brojke, _ i -). */
  id: string;
  /** JSON tekst (fotografija: sama data: adresa). */
  payload: string;
  /** Početna/prazna vrijednost: ne šalje se dok nije ništa usklađeno, i ne gazi ono što već postoji na poslužitelju. */
  pristine?: boolean;
}

export interface RemoteDoc {
  docId: string;
  kind: Kind;
  payload: string;
  deleted: boolean;
  /** Milisekunde poslužiteljskog vremena zadnje izmjene. */
  serverAt: number;
}

export interface Outgoing {
  docId: string;
  kind: Kind;
  payload: string;
  deleted: boolean;
}

export interface Remote {
  pull(sinceMs: number): Promise<RemoteDoc[]>;
  push(docs: Outgoing[]): Promise<void>;
}

export interface Meta {
  /** Korisnik čiji su ovo podaci na poslužitelju; drugi korisnik = sve ispočetka. */
  uid: string;
  since: number;
  /** docId → otisak zadnje usklađenog sadržaja. */
  hashes: Record<string, string>;
}

export const emptyMeta = (uid = ''): Meta => ({ uid, since: 0, hashes: {} });

/** Najveći dopušteni zapis (Firestore dopušta 1 MiB po dokumentu; ostavljamo prostora za polja). */
export const MAX_PAYLOAD = 900_000;

/** cyrb53: brz 53-bitni otisak teksta (dovoljan za prepoznavanje promjene; nije sigurnosni). */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length;
}

export const safeId = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || '_';
export const docIdOf = (kind: Kind, id: string): string => `${kind}__${safeId(id)}`;
export const recDocId = (r: Pick<Rec, 'kind' | 'id'>): string => docIdOf(r.kind, r.id);

/** Sve što sinkronizacija dira. `settings.uiLang` je lokalan (svaki uređaj ima svoj jezik sučelja). */
export interface StudioState {
  items: Item[];
  flyers: Flyer[];
  draft: BookletDraft;
  settings: Settings;
  /** id fotografije → data: adresa (samo za stranice „photos"). */
  photos: Record<string, string>;
}

export { externalizePhotos, inlinePhotos, isPhotoId, newPhotoId, photoSrc, usedPhotos };

const settingsPayload = (s: Settings): string => {
  const { uiLang: _u, ...rest } = s;
  return JSON.stringify(rest);
};

export function toRecords(s: StudioState): Rec[] {
  const recs: Rec[] = [];
  for (const it of s.items) recs.push({ kind: 'item', id: it.id, payload: JSON.stringify(it) });
  for (const f of s.flyers) recs.push({ kind: 'flyer', id: f.id, payload: JSON.stringify(f) });
  for (const [id, url] of Object.entries(usedPhotos(s.draft, s.photos))) recs.push({ kind: 'photo', id, payload: url });
  recs.push({ kind: 'draft', id: 'main', payload: JSON.stringify(s.draft), pristine: JSON.stringify(s.draft) === JSON.stringify(normalizeDraft(undefined, s.draft.lang)) });
  const sp = settingsPayload(s.settings);
  recs.push({ kind: 'settings', id: 'main', payload: sp, pristine: Object.entries(s.settings).every(([k, v]) => k === 'uiLang' || v === '') });
  recs.push({ kind: 'order', id: 'main', payload: JSON.stringify({ items: s.items.map((i) => i.id), flyers: s.flyers.map((f) => f.id) }), pristine: s.items.length === 0 && s.flyers.length === 0 });
  return recs;
}

const parse = (payload: string): unknown => {
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
};

function ordered<T extends { id: string }>(list: T[], order: unknown): T[] {
  if (!Array.isArray(order)) return list;
  const pos = new Map<string, number>(order.filter((x): x is string => typeof x === 'string').map((id, i) => [id, i] as const));
  return [...list].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9));
}

/** Sastavi stanje iz skupa zapisa. Što zapisa nema (npr. prazan uređaj), ostaje kako je u `base`. */
export function fromRecords(recs: Map<string, Rec>, base: StudioState, lang: BookletLang): StudioState {
  const of = (k: Kind) => [...recs.values()].filter((r) => r.kind === k);
  const order = parse(recs.get(docIdOf('order', 'main'))?.payload ?? '') as { items?: unknown; flyers?: unknown } | undefined;
  const items = ordered(normalizeItems(of('item').map((r) => parse(r.payload))), order?.items);
  const flyers = ordered(normalizeFlyers(of('flyer').map((r) => parse(r.payload)), lang), order?.flyers);
  const draftRec = recs.get(docIdOf('draft', 'main'));
  const settingsRec = recs.get(docIdOf('settings', 'main'));
  const draft = draftRec ? normalizeDraft(parse(draftRec.payload), lang) : base.draft;
  const settings = settingsRec ? normalizeSettings({ ...(parse(settingsRec.payload) as object), uiLang: base.settings.uiLang }, base.settings.uiLang) : base.settings;
  const photos: Record<string, string> = {};
  for (const r of of('photo')) photos[r.id] = r.payload;
  return { items, flyers, draft, settings, photos };
}

export interface Changes {
  upserts: Rec[];
  deletes: string[];
}

export interface SyncResult {
  changes: Changes;
  meta: Meta;
  pulled: number;
  pushed: number;
  /** Zapisi koje nije moguće poslati (preveliki); ostaju samo u ovom uređaju. */
  tooBig: string[];
  /** Slanje nije uspjelo (povlačenje jest): meta ne smije tvrditi da je poslano. */
  pushError?: string;
}


/** Što je lokalno izmijenjeno u odnosu na zadnje usklađeno: `dirty` (novo/izmijenjeno) i `removed` (obrisano lokalno). */
function localDiff(local: Rec[], hashes: Record<string, string>) {
  const localMap = new Map<string, { rec: Rec; hash: string }>();
  for (const r of local) localMap.set(recDocId(r), { rec: r, hash: hashText(r.payload) });
  const dirty = new Set<string>();
  const removed = new Set<string>();
  for (const [docId, l] of localMap) {
    const synced = hashes[docId];
    if (synced === undefined) {
      if (!l.rec.pristine) dirty.add(docId);
    } else if (synced !== l.hash) dirty.add(docId);
  }
  for (const docId of Object.keys(hashes)) if (!localMap.has(docId)) removed.add(docId);
  return { localMap, dirty, removed };
}

/** Ima li što za poslati? (Jeftina provjera prije svakog kruga: bez mreže.) */
export function hasLocalChanges(local: Rec[], meta: Meta): boolean {
  const { dirty, removed } = localDiff(local, meta.hashes);
  return dirty.size > 0 || removed.size > 0;
}

/**
 * Jedan krug: povuci novo, pa pošalji lokalne izmjene. Ne mijenja ništa ulazno — vraća što treba primijeniti lokalno i novu `meta`.
 * Greška povlačenja se baca (ništa nije promijenjeno); greška slanja se vraća u `pushError` uz već povučeno.
 */
export async function syncOnce(local: Rec[], metaIn: Meta, remote: Remote): Promise<SyncResult> {
  const meta: Meta = { uid: metaIn.uid, since: metaIn.since, hashes: { ...metaIn.hashes } };
  const { localMap, dirty, removed } = localDiff(local, metaIn.hashes);

  const docs = await remote.pull(metaIn.since);
  docs.sort((a, b) => a.serverAt - b.serverAt);
  const changes: Changes = { upserts: [], deletes: [] };
  const remoteGone = new Set<string>();
  for (const d of docs) {
    meta.since = Math.max(meta.since, d.serverAt);
    if (dirty.has(d.docId) || removed.has(d.docId)) continue; // lokalno pobjeđuje; ide u slanje
    const l = localMap.get(d.docId);
    if (d.deleted) {
      remoteGone.add(d.docId);
      delete meta.hashes[d.docId];
      if (l) changes.deletes.push(d.docId);
      continue;
    }
    const h = hashText(d.payload);
    meta.hashes[d.docId] = h;
    if (!l || l.hash !== h) changes.upserts.push({ kind: d.kind, id: d.docId.slice(d.kind.length + 2), payload: d.payload });
  }

  const out: Outgoing[] = [];
  const tooBig: string[] = [];
  for (const docId of dirty) {
    const l = localMap.get(docId)!;
    if (l.rec.payload.length > MAX_PAYLOAD) {
      tooBig.push(docId);
      continue;
    }
    out.push({ docId, kind: l.rec.kind, payload: l.rec.payload, deleted: false });
  }
  for (const docId of removed) {
    if (remoteGone.has(docId)) continue;
    out.push({ docId, kind: docId.split('__')[0] as Kind, payload: '', deleted: true });
  }
  // fotografije i stavke prije knjižice i redoslijeda: ako slanje stane na pola, knjižica ne pokazuje na slike kojih nema
  const rank = (k: Kind) => (k === 'draft' || k === 'order' ? 1 : 0);
  out.sort((a, b) => rank(a.kind) - rank(b.kind));

  let pushed = 0;
  let pushError: string | undefined;
  if (out.length > 0) {
    try {
      await remote.push(out);
      for (const o of out) {
        if (o.deleted) delete meta.hashes[o.docId];
        else meta.hashes[o.docId] = hashText(o.payload);
      }
      pushed = out.length;
    } catch (e) {
      pushError = String((e as Error)?.message || e);
    }
  }
  return { changes, meta, pulled: docs.length, pushed, tooBig, pushError };
}

/**
 * Primijeni povučeno na TRENUTNO stanje. Zapis koji je korisnik u međuvremenu (dok je sinkronizacija trajala) promijenio se ne dira:
 * `snapshot` je otisak koji je krug vidio; ako se danas razlikuje, preskače se (sljedeći krug ga šalje kao lokalnu izmjenu).
 */
export function applyChanges(state: StudioState, ch: Changes, snapshot: Map<string, string>, lang: BookletLang): StudioState {
  if (ch.upserts.length === 0 && ch.deletes.length === 0) return state;
  const recs = new Map<string, Rec>();
  for (const r of toRecords(state)) recs.set(recDocId(r), r);
  const untouched = (docId: string) => {
    const cur = recs.get(docId);
    return cur ? hashText(cur.payload) === snapshot.get(docId) : !snapshot.has(docId);
  };
  let any = false;
  for (const u of ch.upserts) {
    const docId = recDocId(u);
    if (!untouched(docId)) continue;
    recs.set(docId, u);
    any = true;
  }
  for (const docId of ch.deletes) {
    if (!untouched(docId)) continue;
    recs.delete(docId);
    any = true;
  }
  return any ? fromRecords(recs, state, lang) : state;
}

export const snapshotOf = (recs: Rec[]): Map<string, string> => new Map(recs.map((r) => [recDocId(r), hashText(r.payload)] as const));
