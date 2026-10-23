/**
 * Podaci aplikacije (čisto, bez preglednika, pod testom): cipele, postavke, sigurnosna kopija i pretvorba u ulaz za knjižicu.
 * Sve što korisnik upiše ostaje u uređaju; ništa se ne šalje na server.
 */
import { BookletBuildInput, BookletContact, BookletDraft, BookletLang, BookletShoe, normalizeDraft } from './booklet';

export interface Shoe {
  id: string;
  title: string;
  /** Slobodan tekst cijene kako je Parry upiše („฿699", „from 599"). Prazno = bez cijene. */
  price: string;
  images: string[];
}

export interface Settings {
  uiLang: BookletLang;
  businessName: string;
  ownerName: string;
  /** Telefon i WhatsApp u međunarodnom obliku (+66…). */
  phone: string;
  whatsapp: string;
  lineUrl: string;
  lineDisplay: string;
  email: string;
  shopUrl: string;
}

export const defaultSettings = (uiLang: BookletLang = 'en'): Settings => ({
  uiLang,
  businessName: '',
  ownerName: '',
  phone: '',
  whatsapp: '',
  lineUrl: '',
  lineDisplay: '',
  email: '',
  shopUrl: '',
});

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function normalizeSettings(raw: unknown, fallbackLang: BookletLang = 'en'): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    uiLang: o.uiLang === 'th' ? 'th' : o.uiLang === 'en' ? 'en' : fallbackLang,
    businessName: str(o.businessName, 80),
    ownerName: str(o.ownerName, 80),
    phone: str(o.phone, 40),
    whatsapp: str(o.whatsapp, 40),
    lineUrl: str(o.lineUrl, 300),
    lineDisplay: str(o.lineDisplay, 80),
    email: str(o.email, 120),
    shopUrl: str(o.shopUrl, 300),
  };
}

export function normalizeShoes(raw: unknown): Shoe[] {
  const seen = new Set<string>();
  const out: Shoe[] = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    let id = str(o.id, 40);
    if (!id || seen.has(id)) id = newId(seen);
    seen.add(id);
    out.push({
      id,
      title: str(o.title, 120),
      price: str(o.price, 60),
      images: (Array.isArray(o.images) ? o.images : []).filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 3),
    });
    if (out.length >= 500) break;
  }
  return out;
}

export const newId = (taken: Set<string> = new Set()): string => {
  let id = '';
  do id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  while (taken.has(id));
  return id;
};

/**
 * Telefonski broj za wa.me / tel: — samo znamenke u MEĐUNARODNOM obliku. Broj koji počinje nulom („0945…") nema pozivni broj zemlje i NE pogađa se
 * (pogrešna zemlja bi poslala goste na tuđi telefon): vraća '' i sučelje to kaže.
 */
export function toE164(input: string): string {
  const t = input.trim();
  if (!t) return '';
  let d = t.replace(/\D/g, '');
  if (t.startsWith('00')) d = d.replace(/^00/, '');
  if (!d || d.startsWith('0')) return '';
  return d.length >= 7 && d.length <= 15 ? d : '';
}

export interface SettingsIssue {
  field: 'phone' | 'whatsapp' | 'shopUrl' | 'lineUrl';
}
export function settingsIssues(s: Settings): SettingsIssue[] {
  const out: SettingsIssue[] = [];
  if (s.phone.trim() && !toE164(s.phone)) out.push({ field: 'phone' });
  if (s.whatsapp.trim() && !toE164(s.whatsapp)) out.push({ field: 'whatsapp' });
  if (s.shopUrl.trim() && !/^https?:\/\//i.test(s.shopUrl.trim())) out.push({ field: 'shopUrl' });
  if (s.lineUrl.trim() && !/^https?:\/\//i.test(s.lineUrl.trim())) out.push({ field: 'lineUrl' });
  return out;
}

export function toContact(s: Settings): BookletContact {
  return {
    businessName: s.businessName,
    ownerName: s.ownerName,
    phoneDisplay: s.phone,
    phoneE164: toE164(s.phone),
    whatsappE164: toE164(s.whatsapp),
    lineUrl: /^https?:\/\//i.test(s.lineUrl) ? s.lineUrl : '',
    lineDisplay: s.lineDisplay,
    email: s.email,
    shopUrl: /^https?:\/\//i.test(s.shopUrl) ? s.shopUrl : '',
  };
}

/** Ulaz za slaganje knjižice: samo cipele koje su na stranicama ili naslovnici (datoteka ne nosi slike koje nitko ne koristi). */
export function toBuildInput(draft: BookletDraft, shoes: Shoe[], settings: Settings): BookletBuildInput {
  const wanted = new Set<string>();
  if (draft.coverShoeId) wanted.add(draft.coverShoeId);
  const photos: Record<string, string> = {};
  for (const p of draft.pages) {
    if (p.type === 'shoes') p.shoeIds.forEach((id) => wanted.add(id));
    else if (p.type === 'photos') p.items.forEach((it) => (photos[it.ref] = it.ref)); // ref je sama slika (data: adresa)
  }
  const bookletShoes: BookletShoe[] = shoes.filter((s) => wanted.has(s.id)).map((s) => ({ id: s.id, title: s.title, images: s.images, priceText: draft.showPrices ? s.price : '' }));
  return { draft, shoes: bookletShoes, photos, contact: toContact(settings) };
}

export const BACKUP_VERSION = 1;
export interface Backup {
  app: 'booklet-studio';
  version: number;
  savedAt: string;
  shoes: Shoe[];
  settings: Settings;
  draft: BookletDraft;
}

export const makeBackup = (shoes: Shoe[], settings: Settings, draft: BookletDraft, now: Date = new Date()): Backup => ({ app: 'booklet-studio', version: BACKUP_VERSION, savedAt: now.toISOString(), shoes, settings, draft });

/** Čita sigurnosnu kopiju. Tuđa ili oštećena datoteka se ODBIJA s razlogom, ne uvozi se napola. */
export function parseBackup(text: string): { ok: true; shoes: Shoe[]; settings: Settings; draft: BookletDraft } | { ok: false; reason: 'not-json' | 'not-ours' | 'newer' } {
  let o: any;
  try {
    o = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!o || o.app !== 'booklet-studio' || !Array.isArray(o.shoes)) return { ok: false, reason: 'not-ours' };
  if (typeof o.version === 'number' && o.version > BACKUP_VERSION) return { ok: false, reason: 'newer' };
  const settings = normalizeSettings(o.settings);
  return { ok: true, shoes: normalizeShoes(o.shoes), settings, draft: normalizeDraft(o.draft, settings.uiLang) };
}
