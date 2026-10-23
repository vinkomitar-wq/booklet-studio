/**
 * Uvoz brodova iz flote thailandboattours.com (čisto, bez mreže i preglednika — pod testom). Flota je u bazi te aplikacije (`fleet/vessels`, popis `list`),
 * javno čitljiva. Uvozi se SAMO ono što gost smije vidjeti: ime, model, broj gostiju i fotografije. Ime tvrtke koja brodom upravlja (`company`, `isCustomBy`)
 * se NE čita i ne ulazi u stavku — to je namjerno (gost ga ne smije dobiti kroz knjižicu).
 */
import { pickImages } from './shopImport';
import type { Item } from './studio';

/** Šifra uvezenog broda u `Item.shopId` (isto polje kao za cipele; prefiks razlikuje izvor). */
export const FLEET_PREFIX = 'fleet:';
export const SITE_ORIGIN = 'https://thailandboattours.com';

export interface FleetBoat {
  id: string;
  name: string;
  model: string;
  capacity: number;
  /** Sirovi zapisi slika: `data:image/…`, `https://…` ili putanja na stranici (`/fleet/x.jpg`). */
  images: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Fotografije iz knjižnice slika flote (`fleet/photos_library.photos`): samo kategorija „fleet", vezane uz brod po `vesselId`. */
export function libraryPhotos(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!Array.isArray(raw)) return out;
  for (const p of raw) {
    if (!isObj(p) || p.category !== 'fleet' || typeof p.vesselId !== 'string' || typeof p.url !== 'string' || !p.url) continue;
    const list = out.get(p.vesselId) ?? [];
    list.push(p.url);
    out.set(p.vesselId, list);
  }
  return out;
}

export function parseFleet(raw: unknown, library: unknown = undefined): FleetBoat[] {
  if (!Array.isArray(raw)) return [];
  const lib = libraryPhotos(library);
  const out: FleetBoat[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isObj(r) || typeof r.id !== 'string' || !r.id.trim() || seen.has(r.id)) continue;
    seen.add(r.id);
    const imgs = (Array.isArray(r.images) ? r.images : []).filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (typeof r.image === 'string' && r.image && !imgs.includes(r.image)) imgs.unshift(r.image);
    // knjižnica slika: ostale fotografije istog broda (bez duplikata, redom)
    for (const u of lib.get(r.id.trim()) ?? []) if (!imgs.includes(u)) imgs.push(u);
    out.push({
      id: r.id.trim().slice(0, 50),
      name: typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '',
      model: typeof r.model === 'string' ? r.model.trim().slice(0, 80) : '',
      capacity: typeof r.capacity === 'number' && Number.isFinite(r.capacity) && r.capacity > 0 ? Math.round(r.capacity) : 0,
      images: imgs,
    });
  }
  return out;
}

/** Putanja na stranici → puna adresa; `data:` i `https://` ostaju; ostalo (npr. `javascript:`) se odbacuje. */
export function resolveBoatImage(ref: string): string {
  if (ref.startsWith('data:image/')) return ref;
  if (/^https:\/\//i.test(ref)) return ref;
  if (ref.startsWith('/') && !ref.startsWith('//')) return SITE_ORIGIN + ref;
  return '';
}

/** Opis iz podataka koji stvarno postoje („Catlante 600 · up to 12 guests"); ništa se ne izmišlja. */
export function boatDesc(b: Pick<FleetBoat, 'model' | 'capacity'>): string {
  return [b.model, b.capacity > 0 ? `up to ${b.capacity} guests` : ''].filter(Boolean).join(' · ');
}

export const isFleetItem = (i: Pick<Item, 'shopId'>): boolean => !!i.shopId && i.shopId.startsWith(FLEET_PREFIX);
export const isShopItem = (i: Pick<Item, 'shopId'>): boolean => !!i.shopId && !i.shopId.startsWith(FLEET_PREFIX);

export interface BoatImportResult {
  added: Item[];
  total: number;
  already: number;
  /** Već uvezeni brodovi kojima su dodane slike (imali su ih manje od 3, a sada ih ima više). */
  updated: number;
  /** Brodovi bez ijedne upotrebljive slike (imena, da se zna koje dodati ručno). */
  noImage: string[];
  /** Uvezeni brodovi kojima se neka slika nije dala dohvatiti (npr. stranica ne dopušta). */
  partial: number;
}

const MAX_PER_BOAT = 3;

/**
 * Uvoz s ubrizganim dohvatom. `fetchImage` vraća `data:image/…` ili baca grešku (blokirano/nema mreže) — jedna slika koja ne dođe ne ruši brod, ali se broji.
 * Brod ulazi ako ima barem jednu sliku. Već uvezeni brod s manje od 3 slike se DOPUNI (slike se zamijene većim skupom); naslov, opis i cijena koje je
 * korisnik uredio se ne diraju, a brod koji već ima 3 slike se uopće ne dohvaća (svaka slika je jedan poziv prema tuđoj stranici/bazi).
 * `fetchLibrary` je neobavezan: ako padne, uvoz ide dalje samo sa slikama zapisanim uz brod.
 */
export async function runBoatImport(
  existing: Item[],
  fetchFleet: () => Promise<unknown>,
  fetchImage: (url: string) => Promise<string>,
  newItemId: (taken: Set<string>) => string,
  fetchLibrary: () => Promise<unknown> = async () => undefined,
  concurrency = 3,
): Promise<BoatImportResult> {
  const fleetRaw = await fetchFleet();
  let libRaw: unknown;
  try {
    libRaw = await fetchLibrary();
  } catch {
    libRaw = undefined;
  }
  const boats = parseFleet(fleetRaw, libRaw);
  const byFleetId = new Map(existing.filter(isFleetItem).map((i) => [i.shopId as string, i] as const));
  const work = boats.filter((b) => {
    const have = byFleetId.get(FLEET_PREFIX + b.id);
    return !have || have.images.length < MAX_PER_BOAT;
  });
  const res: BoatImportResult = { added: [], total: boats.length, already: 0, updated: 0, noImage: [], partial: 0 };
  const got = new Map<string, { imgs: string[]; failed: boolean }>();
  let next = 0;
  const worker = async () => {
    while (next < work.length) {
      const b = work[next++];
      const imgs: string[] = [];
      let failed = false;
      for (const raw of b.images.slice(0, 12)) {
        if (imgs.length >= MAX_PER_BOAT) break;
        const url = resolveBoatImage(raw);
        if (!url) continue;
        try {
          const d = await fetchImage(url);
          if (d.startsWith('data:image/')) imgs.push(d);
          else failed = true;
        } catch {
          failed = true;
        }
      }
      got.set(b.id, { imgs, failed });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const taken = new Set(existing.map((i) => i.id));
  res.already = boats.length - work.length;
  for (const b of work) {
    const g = got.get(b.id);
    const images = g ? pickImages(g.imgs) : [];
    const have = byFleetId.get(FLEET_PREFIX + b.id);
    if (have) {
      if (images.length > have.images.length) {
        res.updated++;
        res.added.push({ ...have, images }); // isti id: pozivatelj zamjenjuje postojeću stavku
      } else res.already++;
      continue;
    }
    if (images.length === 0) {
      res.noImage.push(b.name || b.id);
      continue;
    }
    if (g?.failed) res.partial++;
    const id = newItemId(taken);
    taken.add(id);
    res.added.push({ id, title: b.name || b.id, price: '', desc: boatDesc(b), images, shopId: FLEET_PREFIX + b.id });
  }
  return res;
}
