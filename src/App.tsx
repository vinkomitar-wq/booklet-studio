import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookletDraft,
  BookletPage,
  BookletShoesPage,
  LABELS,
  SHOES_PER_PAGE,
  bookletOutline,
  cleanPerPage,
  draftIssues,
  movePage,
  newPageId,
  normalizeDraft,
  perPageOf,
  shareMessage,
  toggleShoe,
  defaultDraft,
  type BookletLang,
} from './lib/booklet';
import { dbGet, dbSet } from './lib/db';
import { baseName, downloadBlob, downloadFile, pictureFiles, prepare, printPicture, shareFile, sharePictures, zipPictures } from './lib/export';
import { renderBookletImages } from './lib/render';
import { renderFlyer } from './lib/flyerRender';
import { FLYER_LAYOUTS, FLYER_SLOTS, Flyer, FlyerLayout, flyerIssues, flyerModel, newFlyer, normalizeFlyers, setLayout, toggleFlyerItem } from './lib/flyer';
import { photoToDataUrl } from './lib/images';
import { runShopImport } from './lib/shopImport';
import { isFleetItem, isShopItem, runBoatImport } from './lib/boatImport';
import { externalizePhotos, inlinePhotos, newPhotoId, photoSrc, usedPhotos, type StudioState } from './lib/sync';
import { useCloudSync, type CloudInfo } from './useCloudSync';
import { Settings, Item, boatTripPreset, defaultSettings, makeBackup, newId, normalizeSettings, normalizeItems, parseBackup, settingsIssues, toBuildInput, toContact } from './lib/studio';
import { Key, tr } from './i18n';

type Tab = 'items' | 'booklet' | 'flyers' | 'settings';
type Msg = { text: string; ok: boolean };
type TFn = (k: Key, v?: Record<string, string | number>) => string;
const BIG_BYTES = 8 * 1024 * 1024;
const guessLang = (): BookletLang => (typeof navigator !== 'undefined' && /^th/i.test(navigator.language) ? 'th' : 'en');

/** Spremanje u uređaj nakon stanke u promjenama; prvo učitano stanje se ne zapisuje natrag. Greška ide u `onError`, ne guta se. */
function useAutosave<T>(key: string, value: T, baseline: T | null, onError: (e: unknown) => void) {
  useEffect(() => {
    if (baseline === null || value === baseline) return;
    const id = window.setTimeout(() => {
      dbSet(key, value).catch(onError);
    }, 400);
    return () => window.clearTimeout(id);
  }, [key, value, baseline]); // eslint-disable-line react-hooks/exhaustive-deps
}

export default function App() {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>(() => defaultSettings(guessLang()));
  const [draft, setDraft] = useState<BookletDraft>(() => defaultDraft(guessLang()));
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<{ items: Item[]; settings: Settings; draft: BookletDraft; flyers: Flyer[]; photos: Record<string, string> } | null>(null);
  const [fatal, setFatal] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const lang = settings.uiLang;
  const t = useCallback<TFn>((k, v) => tr(lang, k, v), [lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // ključ 'shoes' ostaje: tako su već spremljeni podaci (stavke se nekad zvale cipele)
        const [s, st, d, fl, ph] = await Promise.all([dbGet('shoes'), dbGet('settings'), dbGet('draft'), dbGet('flyers'), dbGet('photos')]);
        if (!alive) return;
        const ls = normalizeItems(s);
        const lset = normalizeSettings(st, guessLang());
        const ld = normalizeDraft(d, lset.uiLang);
        const lf = normalizeFlyers(fl, lset.uiLang);
        const lp = cleanPhotos(ph);
        // stare fotografije stranica (cijela slika u zapisu knjižice) prelaze u zasebne zapise; autospremanje ih odmah upiše
        const mig = externalizePhotos(ld, lp);
        setItems(ls);
        setSettings(lset);
        setDraft(mig.draft);
        setFlyers(lf);
        setPhotos(mig.photos);
        setLoaded({ items: ls, settings: lset, draft: ld, flyers: lf, photos: lp });
      } catch (e: any) {
        if (alive) setFatal(String(e?.message || e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onSaveError = useCallback((e: unknown) => setSaveErr(String((e as Error)?.message || e)), []);
  useAutosave('shoes', items, loaded?.items ?? null, onSaveError);
  useAutosave('settings', settings, loaded?.settings ?? null, onSaveError);
  useAutosave('draft', draft, loaded?.draft ?? null, onSaveError);
  useAutosave('flyers', flyers, loaded?.flyers ?? null, onSaveError);
  useAutosave('photos', photos, loaded?.photos ?? null, onSaveError);

  const studio = useMemo<StudioState>(() => ({ items, flyers, draft, settings, photos }), [items, flyers, draft, settings, photos]);
  const persistAll = useCallback(
    (s: StudioState) => Promise.all([dbSet('shoes', s.items), dbSet('settings', s.settings), dbSet('draft', s.draft), dbSet('flyers', s.flyers), dbSet('photos', s.photos)]).then(() => undefined),
    [],
  );
  const setAll = useCallback((s: StudioState) => {
    setItems(s.items);
    setSettings(s.settings);
    setDraft(s.draft);
    setFlyers(s.flyers);
    setPhotos(s.photos);
  }, []);
  const cloud = useCloudSync({ ready: !!loaded, state: studio, setState: setAll, persist: persistAll, lang });

  if (fatal)
    return (
      <div className={`app lang-${lang}`}>
        <div className="card">
          <p className="err" data-fatal>{t('loadFail', { detail: fatal })}</p>
        </div>
      </div>
    );
  if (!loaded) return <div className="app" />;

  return (
    <div className={`app lang-${lang}`}>
      <header className="top">
        <h1>{t('appName')}</h1>
        <button type="button" className="cloudchip" data-cloud-chip onClick={() => setTab('settings')} title={cloudText(t, cloud.info)}>{cloudChip(cloud.info)}</button>
        <nav className="tabs">
          {(['items', 'booklet', 'flyers', 'settings'] as Tab[]).map((k) => (
            <button key={k} type="button" className="tab" aria-pressed={tab === k} data-tab={k} onClick={() => setTab(k)}>
              {t(k === 'items' ? 'tabItems' : k === 'booklet' ? 'tabBooklet' : k === 'flyers' ? 'tabFlyers' : 'tabSettings')}
            </button>
          ))}
        </nav>
      </header>
      {saveErr && (
        <p role="alert" className="err" data-save-error>
          {t('saveFail', { detail: saveErr })}
        </p>
      )}
      {tab === 'items' && <ItemsTab t={t} items={items} setItems={setItems} />}
      {tab === 'booklet' && <BookletTab t={t} items={items} settings={settings} draft={draft} setDraft={setDraft} photos={photos} setPhotos={setPhotos} />}
      {tab === 'flyers' && <FlyersTab t={t} lang={lang} items={items} settings={settings} flyers={flyers} setFlyers={setFlyers} />}
      {tab === 'settings' && (
        <SettingsTab
          t={t}
          settings={settings}
          setSettings={setSettings}
          items={items}
          draft={draft}
          flyers={flyers}
          photos={photos}
          cloud={cloud}
          onRestore={(s, st, d, fl) => {
            const mig = externalizePhotos(d, {});
            setItems(s);
            setSettings(st);
            setDraft(mig.draft);
            setFlyers(fl);
            setPhotos(mig.photos);
            // zapiši odmah: povratak ne smije ovisiti o stanci autospremanja
            void persistAll({ items: s, settings: st, draft: mig.draft, flyers: fl, photos: mig.photos }).catch(onSaveError);
          }}
        />
      )}
    </div>
  );
}

/* ───────────── Cipele ───────────── */
function ItemsTab({ t, items, setItems }: { t: TFn; items: Item[]; setItems: (f: (s: Item[]) => Item[]) => void }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const many = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'all' | 'shoes' | 'boats' | 'own'>('all');
  const kinds = { shoes: items.some(isShopItem), boats: items.some(isFleetItem), own: items.some((i) => !i.shopId) };
  const showChips = Object.values(kinds).filter(Boolean).length >= 2;
  const shown = items.filter((i) => !showChips || source === 'all' || (source === 'shoes' ? isShopItem(i) : source === 'boats' ? isFleetItem(i) : !i.shopId));

  const addMany = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const made: Item[] = [];
      for (const f of Array.from(files)) made.push({ id: newId(new Set([...items.map((s) => s.id), ...made.map((m) => m.id)])), title: '', price: '', desc: '', images: [await photoToDataUrl(f)] });
      setItems((s) => [...s, ...made]);
      setMsg({ text: t('addedN', { n: made.length }), ok: true });
    } catch (e: any) {
      setMsg({ text: t('photoFail', { detail: String(e?.message || e).slice(0, 120) }), ok: false });
    }
    setBusy(false);
  };
  // Uvoz iz web-dućana: samo čita; uvezeno i uređeno se ne dira (ista cipela se ne uvozi dvaput)
  const importShop = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const cloud = await import('./lib/cloud');
      const r = await runShopImport(items, cloud.fetchShopCollection, cloud.fetchShopImage, (taken) => newId(taken));
      if (r.added.length > 0) setItems((s) => [...s, ...r.added.filter((a) => !s.some((x) => x.shopId && x.shopId === a.shopId))]);
      const parts = [t('shopAdded', { n: r.added.length })];
      if (r.already > 0) parts.push(t('shopAlready', { n: r.already }));
      if (r.hidden > 0) parts.push(t('shopHidden', { n: r.hidden }));
      if (r.noImage > 0) parts.push(t('shopNoImage', { n: r.noImage }));
      if (r.failed > 0) parts.push(t('shopFailed', { n: r.failed }));
      setMsg({ text: r.total === 0 ? t('shopEmpty') : parts.join(' · '), ok: r.total > 0 && r.failed === 0 });
    } catch (e: any) {
      setMsg({ text: t('shopFail', { detail: String(e?.code || e?.message || e).slice(0, 120) }), ok: false });
    }
    setBusy(false);
  };
  // Uvoz brodova s thailandboattours.com: samo čita; slike idu kroz isto smanjivanje kao ručno dodane
  const importBoats = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const cloud = await import('./lib/cloud');
      const grab = async (url: string) => {
        const r = await fetch(url, { mode: 'cors' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const b = await r.blob();
        return photoToDataUrl(new File([b], 'boat.jpg', { type: b.type.startsWith('image/') ? b.type : 'image/jpeg' }));
      };
      const r = await runBoatImport(items, cloud.fetchFleet, grab, (taken) => newId(taken));
      if (r.added.length > 0) setItems((s) => [...s, ...r.added.filter((a) => !s.some((x) => x.shopId && x.shopId === a.shopId))]);
      const parts = [t('shopAdded', { n: r.added.length })];
      if (r.already > 0) parts.push(t('shopAlready', { n: r.already }));
      if (r.partial > 0) parts.push(t('boatPartial', { n: r.partial }));
      if (r.noImage.length > 0) parts.push(t('boatNoImage', { names: r.noImage.slice(0, 6).join(', ') }));
      setMsg({ text: r.total === 0 ? t('boatEmpty') : parts.join(' · '), ok: r.total > 0 && r.noImage.length === 0 && r.partial === 0 });
    } catch (e: any) {
      setMsg({ text: t('shopFail', { detail: String(e?.code || e?.message || e).slice(0, 120) }), ok: false });
    }
    setBusy(false);
  };
  const remove = (id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirm(null);
    setItems((s) => s.filter((x) => x.id !== id));
  };

  return (
    <>
      <div className="card">
        <h2>{t('tabItems')}</h2>
        <p className="hint">{t('itemsHint')}</p>
        <div className="row">
          <button type="button" className="btn primary" data-add-item onClick={() => setEditing({ id: newId(new Set(items.map((s) => s.id))), title: '', price: '', desc: '', images: [] })}>
            + {t('addItem')}
          </button>
          <button type="button" className="btn" data-add-many disabled={busy} onClick={() => many.current?.click()}>
            + {t('addMany')}
          </button>
          <button type="button" className="btn" data-import-shop disabled={busy} onClick={() => void importShop()}>
            {busy ? t('building') : t('shopImport')}
          </button>
          <button type="button" className="btn" data-import-boats disabled={busy} onClick={() => void importBoats()}>
            {busy ? t('building') : t('boatImport')}
          </button>
          <input ref={many} type="file" accept="image/*" multiple hidden data-many-input onChange={(e) => { void addMany(e.target.files); e.target.value = ''; }} />
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
        {showChips && (
          <div className="seg" style={{ marginTop: 12 }} data-source-chips>
            {(['all', 'shoes', 'boats', 'own'] as const).filter((k) => k === 'all' || kinds[k]).map((k) => (
              <button key={k} type="button" data-source={k} aria-pressed={source === k} onClick={() => setSource(k)}>{t(k === 'all' ? 'srcAll' : k === 'shoes' ? 'srcShoes' : k === 'boats' ? 'srcBoats' : 'srcOwn')}</button>
            ))}
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <p className="empty" data-empty>{t('noItems')}</p>
      ) : (
        <div className="grid">
          {shown.map((s) => (
            <div key={s.id} className="shoe" data-item={s.id}>
              <div className="ph">{s.images[0] ? <img src={s.images[0]} alt="" /> : t('noPhoto')}</div>
              <div className="meta">
                <b>{s.title || '—'}</b>
                <span>{s.price}</span>
              </div>
              <div className="acts">
                <button type="button" className="btn small" data-edit-item onClick={() => setEditing(s)}>{t('edit')}</button>
                <button type="button" className={`btn small ${confirm === s.id ? 'danger-armed' : ''}`} data-remove-item onClick={() => remove(s.id)}>
                  {confirm === s.id ? t('removeSure') : t('remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <ItemEditor
          t={t}
          shoe={editing}
          onCancel={() => setEditing(null)}
          onSave={(sh) => {
            setItems((all) => (all.some((x) => x.id === sh.id) ? all.map((x) => (x.id === sh.id ? sh : x)) : [...all, sh]));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ItemEditor({ t, shoe, onSave, onCancel }: { t: TFn; shoe: Item; onSave: (s: Item) => void; onCancel: () => void }) {
  const [s, setS] = useState<Item>(shoe);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    setErr('');
    try {
      const room = 3 - s.images.length;
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, Math.max(0, room))) out.push(await photoToDataUrl(f));
      setS((cur) => ({ ...cur, images: [...cur.images, ...out].slice(0, 3) }));
    } catch (e: any) {
      setErr(t('photoFail', { detail: String(e?.message || e).slice(0, 120) }));
    }
    setBusy(false);
  };
  const save = () => {
    if (s.images.length === 0) return setErr(t('needPhoto'));
    onSave({ ...s, title: s.title.trim(), price: s.price.trim(), desc: s.desc.trim() });
  };
  return (
    <div className="sheet" data-item-editor>
      <div className="box">
        <label className="f">
          <span>{t('itemName')}</span>
          <input type="text" data-item-title value={s.title} maxLength={120} onChange={(e) => setS({ ...s, title: e.target.value })} />
        </label>
        <label className="f">
          <span>{t('itemPrice')}</span>
          <input type="text" data-item-price value={s.price} maxLength={60} onChange={(e) => setS({ ...s, price: e.target.value })} />
        </label>
        <label className="f">
          <span>{t('itemDesc')}</span>
          <textarea style={{ minHeight: 56 }} data-item-desc value={s.desc} maxLength={300} onChange={(e) => setS({ ...s, desc: e.target.value })} />
        </label>
        <div className="thumbs">
          {s.images.map((im, i) => (
            <div key={i} className="thumb">
              <img src={im} alt="" />
              <button type="button" aria-label={t('remove')} onClick={() => setS({ ...s, images: s.images.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn" disabled={busy || s.images.length >= 3} onClick={() => file.current?.click()}>+ {t('addPhotos')}</button>
        <input ref={file} type="file" accept="image/*" multiple hidden data-item-file onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
        <p className="hint">{t('photosMax')}</p>
        {err && <p role="alert" className="err" data-item-err>{err}</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" data-item-save onClick={save}>{t('save')}</button>
          <button type="button" className="btn" onClick={onCancel}>{t('cancel')}</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Knjižica ───────────── */
function BookletTab({ t, items, settings, draft, setDraft, photos, setPhotos }: { t: TFn; items: Item[]; settings: Settings; draft: BookletDraft; setDraft: (f: (d: BookletDraft) => BookletDraft) => void; photos: Record<string, string>; setPhotos: (f: (p: Record<string, string>) => Record<string, string>) => void }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [pics, setPics] = useState<{ urls: string[]; files: File[] } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const say = (text: string, ok = true) => setMsg({ text, ok });
  const shoeById = useMemo(() => new Map(items.map((s) => [s.id, s] as const)), [items]);
  const hasImg = (id: string) => !!shoeById.get(id)?.images[0];
  const update = (fn: (d: BookletDraft) => BookletDraft) => setDraft(fn);
  const updatePage = (id: string, fn: (p: BookletPage) => BookletPage) => update((d) => ({ ...d, pages: d.pages.map((p) => (p.id === id ? fn(p) : p)) }));

  const addShoesPage = () => update((d) => ({ ...d, pages: [...d.pages, { id: newPageId(d.pages), type: 'shoes', heading: '', shoeIds: [], note: '' }] }));
  const addPhotosPage = () => update((d) => ({ ...d, pages: [...d.pages, { id: newPageId(d.pages), type: 'photos', heading: '', items: [], note: '' }] }));
  const addTextPage = () => update((d) => ({ ...d, pages: [...d.pages, { id: newPageId(d.pages), type: 'text', heading: '', body: '' }] }));
  const addAllShoes = () => {
    const used = new Set(draft.pages.flatMap((p) => (p.type === 'shoes' ? p.shoeIds : [])));
    const ids = items.filter((s) => s.images.length > 0 && !used.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return say(t('allItemsNone'), false);
    update((d) => ({ ...d, pages: [...d.pages, { id: newPageId(d.pages), type: 'shoes', heading: '', shoeIds: ids, note: '' }] }));
    say(t('allItemsDone', { n: ids.length }));
  };
  const removePage = (id: string) => {
    if (confirmRemove !== id) {
      setConfirmRemove(id);
      window.setTimeout(() => setConfirmRemove((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirmRemove(null);
    update((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== id) }));
  };
  const uploadPhotos = async (pageId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy('upload');
    setMsg(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await photoToDataUrl(f));
      // slika se sprema zasebno, stranica nosi samo njezin id (knjižica ostaje mala)
      const added: Record<string, string> = {};
      const refs = urls.map((u) => {
        const id = newPhotoId({ ...photos, ...added });
        added[id] = u;
        return id;
      });
      setPhotos((cur) => ({ ...cur, ...added }));
      updatePage(pageId, (p) => (p.type === 'photos' ? { ...p, items: [...p.items, ...refs.map((ref) => ({ ref, caption: '' }))].slice(0, 60) } : p));
    } catch (e: any) {
      say(t('photoFail', { detail: String(e?.message || e).slice(0, 120) }), false);
    }
    setBusy(null);
  };
  const setLang = (l: BookletLang) =>
    update((d) => ({
      ...d,
      lang: l,
      // naslov i podnaslov koji su još zadani na starom jeziku prelaze na novi; vlastiti tekst se ne dira
      title: d.title === LABELS[d.lang].defaultTitle ? LABELS[l].defaultTitle : d.title,
      subtitle: d.subtitle === LABELS[d.lang].defaultSubtitle ? LABELS[l].defaultSubtitle : d.subtitle,
    }));

  const issues = useMemo(() => {
    const out = draftIssues(draft, new Set(items.map((s) => s.id)));
    for (const p of draft.pages) {
      if (p.type !== 'shoes') continue;
      const existing = p.shoeIds.filter((id) => shoeById.has(id));
      if (existing.length > 0 && !existing.some(hasImg) && !out.some((i) => i.pageId === p.id && i.kind === 'empty-page')) out.push({ pageId: p.id, kind: 'empty-page' });
    }
    return out;
  }, [draft, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageName = (id: string | null) => {
    const i = draft.pages.findIndex((p) => p.id === id);
    return draft.pages[i]?.heading.trim() || t('pageN', { n: i + 1 });
  };
  const issueText = (i: (typeof issues)[number]) => (i.kind === 'no-pages' ? t('issueNoPages') : i.kind === 'unknown-shoe' ? t('issueUnknown', { h: pageName(i.pageId) }) : t('issueEmpty', { h: pageName(i.pageId) }));
  const outline = useMemo(() => bookletOutline(draft, { shoe: hasImg }), [draft, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const outlineLabel = (r: (typeof outline)[number]) => (r.kind === 'cover' ? t('outCover') : r.kind === 'order' ? t('outOrder') : r.parts > 1 ? `${pageName(r.pageId)} (${r.part}/${r.parts})` : pageName(r.pageId));
  const goTo = (id: string | null) => id && document.querySelector(`[data-page-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const contact = toContact(settings);
  const noContact = !contact.whatsappE164 && !contact.phoneE164 && !contact.email && !contact.lineUrl && !contact.shopUrl;

  const build = (kind: string) => {
    setBusy(kind);
    setMsg(null);
    try {
      const b = prepare(toBuildInput(draft, items, settings, photos));
      const mb = (b.bytes / 1024 / 1024).toFixed(1);
      setNotes(b.bytes > BIG_BYTES ? [t('big', { size: mb })] : []);
      say(t('done', { size: mb }));
      return b;
    } catch (e: any) {
      console.error('Booklet build failed:', e);
      say(t('buildFail', { detail: String(e?.message || e).slice(0, 120) }), false);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Slike stranica (ono što gost dobije); greška se prikazuje, ne guta. */
  const makePictures = async (kind: string) => {
    setBusy(kind);
    setMsg(null);
    try {
      const blobs = await renderBookletImages(toBuildInput(draft, items, settings, photos));
      const files = pictureFiles(blobs, draft.title);
      const mb = (files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(1);
      setNotes([]);
      say(t('picsReady', { n: files.length, size: mb }));
      return files;
    } catch (e: any) {
      console.error('Picture render failed:', e);
      say(t('buildFail', { detail: String(e?.message || e).slice(0, 120) }), false);
      return null;
    } finally {
      setBusy(null);
    }
  };
  const closePics = () => {
    pics?.urls.forEach((u) => URL.revokeObjectURL(u));
    setPics(null);
  };
  const sendPics = async (files: File[]) => {
    const r = await sharePictures(files, draft.title, shareMessage(draft, contact));
    if (r === 'shared') say(t('shared'));
    else if (r === 'unsupported') {
      downloadBlob(`${baseName(draft.title)}.zip`, await zipPictures(files));
      say(t('shareUnsupportedPics'), false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>{t('basics')}</h2>
        <div className="row">
          <label className="f grow">
            <span>{t('bkName')}</span>
            <input type="text" data-bk-title value={draft.title} maxLength={120} onChange={(e) => update((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label className="f grow">
            <span>{t('bkSub')}</span>
            <input type="text" value={draft.subtitle} maxLength={160} onChange={(e) => update((d) => ({ ...d, subtitle: e.target.value }))} />
          </label>
        </div>
        <div className="row">
          <div>
            <span className="hint" style={{ margin: 0, display: 'block' }}>{t('bkLang')}</span>
            <div className="seg">
              {(['th', 'en'] as const).map((l) => (
                <button key={l} type="button" data-bk-lang={l} aria-pressed={draft.lang === l} onClick={() => setLang(l)}>{l === 'th' ? 'ไทย' : 'English'}</button>
              ))}
            </div>
          </div>
          <label className="f grow" style={{ margin: 0 }}>
            <span>{t('bkCover')}</span>
            <select value={draft.coverShoeId} onChange={(e) => update((d) => ({ ...d, coverShoeId: e.target.value }))}>
              <option value="">{t('bkCoverAuto')}</option>
              {items.filter((s) => s.images.length > 0).map((s) => (
                <option key={s.id} value={s.id}>{s.title || '—'}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="row" style={{ marginTop: 10, cursor: 'pointer', fontWeight: 700 }}>
          <input type="checkbox" checked={draft.showPrices} onChange={(e) => update((d) => ({ ...d, showPrices: e.target.checked }))} /> {t('bkShowPrices')}
        </label>
      </div>

      <div className="card">
        <h2>{t('pages')}</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" className="btn" data-all-items onClick={addAllShoes}>+ {t('allItems')}</button>
          <button type="button" className="btn" data-add-items-page onClick={addShoesPage}>+ {t('addItemsPage')}</button>
          <button type="button" className="btn" onClick={addPhotosPage}>+ {t('addPhotosPage')}</button>
          <button type="button" className="btn" onClick={addTextPage}>+ {t('addTextPage')}</button>
        </div>
        {draft.pages.length > 0 && (
          <div className="outline" data-outline style={{ marginBottom: 12 }}>
            <b style={{ fontSize: 12 }}>{t('outline')}</b>
            <p className="hint">{t('outlineHint')}</p>
            {outline.map((r) => {
              const names = r.shoeIds.map((id) => shoeById.get(id)?.title).filter(Boolean).join(', ');
              return (
                <button key={r.no} type="button" data-outline-row={r.no} disabled={!r.pageId} onClick={() => goTo(r.pageId)}>
                  <span className="n">{r.no}</span>
                  <span style={{ minWidth: 0 }}>
                    <b>{outlineLabel(r)}</b>
                    {r.kind === 'shoes' && <span style={{ opacity: 0.6 }}> · {t('outItems', { n: r.shoeIds.length })}</span>}
                    {names && <span className="names">{names}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {draft.pages.length === 0 && <p className="empty" data-no-pages>{t('issueNoPages')}</p>}
        {draft.pages.map((p, idx) => (
          <div key={p.id} className="page" data-page-id={p.id} data-page-type={p.type}>
            <div className="row" style={{ marginBottom: 8 }}>
              <b className="grow" style={{ fontSize: 13 }}>{idx + 1}. {p.type === 'shoes' ? t('typeItems') : p.type === 'photos' ? t('typePhotos') : t('typeText')}</b>
              <button type="button" className="btn small" aria-label={t('moveUp')} disabled={idx === 0} onClick={() => update((d) => ({ ...d, pages: movePage(d.pages, p.id, -1) }))}>↑</button>
              <button type="button" className="btn small" aria-label={t('moveDown')} disabled={idx === draft.pages.length - 1} onClick={() => update((d) => ({ ...d, pages: movePage(d.pages, p.id, 1) }))}>↓</button>
              <button type="button" className={`btn small ${confirmRemove === p.id ? 'danger-armed' : ''}`} data-remove-page onClick={() => removePage(p.id)}>{confirmRemove === p.id ? t('removeSure') : t('remove')}</button>
            </div>
            <label className="f">
              <span>{t('heading')}</span>
              <input type="text" value={p.heading} maxLength={120} onChange={(e) => updatePage(p.id, (x) => ({ ...x, heading: e.target.value }))} />
            </label>
            {p.type === 'shoes' && (
              <>
                <span className="hint" style={{ margin: 0, display: 'block' }}>{t('perPage')}</span>
                <div className="seg">
                  {SHOES_PER_PAGE.map((n) => (
                    <button key={n} type="button" data-per-page={n} aria-pressed={perPageOf(p) === n} onClick={() => updatePage(p.id, (x) => (x.type === 'shoes' ? { ...x, perPage: cleanPerPage(n) } : x))}>{n}</button>
                  ))}
                </div>
                <p className="hint">{t('perPageHint')}</p>
                <div className="row" style={{ marginBottom: 6 }}>
                  <button type="button" className="btn small" onClick={() => updatePage(p.id, (x) => (x.type === 'shoes' ? { ...x, shoeIds: items.filter((s) => s.images.length > 0).map((s) => s.id) } : x))}>{t('selectAll')}</button>
                  <button type="button" className="btn small" onClick={() => updatePage(p.id, (x) => (x.type === 'shoes' ? { ...x, shoeIds: [] } : x))}>{t('selectNone')}</button>
                </div>
                <div className="pick">
                  {items.map((s) => {
                    const on = p.shoeIds.includes(s.id);
                    return (
                      <label key={s.id} className={on ? 'on' : ''} data-pick={s.id}>
                        <input type="checkbox" checked={on} onChange={() => updatePage(p.id, (x) => (x.type === 'shoes' ? toggleShoe(x as BookletShoesPage, s.id) : x))} />
                        {s.images[0] ? <img src={s.images[0]} alt="" /> : <span className="ph0" />}
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{s.title || '—'}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            {p.type === 'photos' && (
              <>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))' }}>
                  {p.items.map((it, i) => (
                    <div key={i} className="shoe" data-photo>
                      <div className="ph"><img src={photoSrc(photos, it.ref)} alt="" /></div>
                      <div className="meta">
                        <input type="text" aria-label={t('caption')} placeholder={t('caption')} value={it.caption} maxLength={200} onChange={(e) => updatePage(p.id, (x) => (x.type === 'photos' ? { ...x, items: x.items.map((y, j) => (j === i ? { ...y, caption: e.target.value } : y)) } : x))} />
                      </div>
                      <div className="acts">
                        <button type="button" className="btn small" onClick={() => updatePage(p.id, (x) => (x.type === 'photos' ? { ...x, items: x.items.filter((_, j) => j !== i) } : x))}>{t('remove')}</button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="btn" style={{ marginTop: 8 }}>
                  + {t('addPhotos')}
                  <input type="file" accept="image/*" multiple hidden data-photos-input onChange={(e) => { void uploadPhotos(p.id, e.target.files); e.target.value = ''; }} />
                </label>
              </>
            )}
            {p.type === 'text' ? (
              <label className="f">
                <span>{t('body')}</span>
                <textarea value={p.body} maxLength={6000} onChange={(e) => updatePage(p.id, (x) => (x.type === 'text' ? { ...x, body: e.target.value } : x))} />
              </label>
            ) : (
              <label className="f" style={{ marginTop: 10 }}>
                <span>{t('note')}</span>
                <textarea style={{ minHeight: 56 }} value={p.note} maxLength={2000} onChange={(e) => updatePage(p.id, (x) => (x.type === 'text' ? x : { ...x, note: e.target.value }))} />
              </label>
            )}
          </div>
        ))}
      </div>

      <LastPageEditor t={t} lang={draft.lang} draft={draft} update={update} />

      <div className="card">
        {noContact && <p className="warn" data-no-contact>⚠ {t('noContact')}</p>}
        {issues.map((i, n) => (
          <p key={n} className="warn">⚠ {issueText(i)}</p>
        ))}
        <div className="row">
          <button type="button" className="btn primary" data-send-pics disabled={busy !== null} onClick={async () => { const f = await makePictures('send'); if (f) await sendPics(f); }}>{busy === 'send' ? t('building') : t('sendPics')}</button>
          <button type="button" className="btn" data-preview-pics disabled={busy !== null} onClick={async () => { const f = await makePictures('preview'); if (f) setPics({ files: f, urls: f.map((x) => URL.createObjectURL(x)) }); }}>{busy === 'preview' ? t('building') : t('preview')}</button>
          <button type="button" className="btn" data-zip disabled={busy !== null} onClick={async () => { const f = await makePictures('zip'); if (f) downloadBlob(`${baseName(draft.title)}.zip`, await zipPictures(f)); }}>{busy === 'zip' ? t('building') : t('savePics')}</button>
          <button
            type="button"
            className="btn"
            data-copy
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareMessage(draft, contact));
                say(t('copied'));
              } catch {
                say(shareMessage(draft, contact), false); // bez dozvole za međuspremnik: tekst se pokaže da se može označiti
              }
            }}
          >
            {t('copyMsg')}
          </button>
        </div>
        <details style={{ marginTop: 12 }}>
          <summary className="hint" style={{ cursor: 'pointer' }}>{t('moreFormats')}</summary>
          <p className="hint">{t('htmlHint')}</p>
          <div className="row">
            <button type="button" className="btn small" data-preview disabled={busy !== null} onClick={() => { const b = build('preview-html'); if (b) setPreviewHtml(b.html); }}>{t('previewHtml')}</button>
            <button type="button" className="btn small" data-download disabled={busy !== null} onClick={() => { const b = build('download'); if (b) downloadFile(b.fileName, b.html); }}>{t('download')}</button>
            <button
              type="button"
              className="btn small"
              data-share
              disabled={busy !== null}
              onClick={async () => {
                const b = build('share');
                if (!b) return;
                const r = await shareFile(b, draft.title, shareMessage(draft, contact));
                if (r === 'shared') say(t('shared'));
                else if (r === 'unsupported') {
                  downloadFile(b.fileName, b.html);
                  say(t('shareUnsupported'), false);
                }
              }}
            >
              {t('shareHtml')}
            </button>
          </div>
        </details>
        {msg && <p data-msg role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'} style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>}
        {notes.map((n, i) => (
          <p key={i} className="warn">⚠ {n}</p>
        ))}
      </div>
      {pics && (
        <div className="modal" data-pics-modal>
          <div className="bar" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => void sendPics(pics.files)}>{t('sendPics')}</button>
            <button type="button" className="btn" onClick={async () => downloadBlob(`${baseName(draft.title)}.zip`, await zipPictures(pics.files))}>{t('savePics')}</button>
            <button type="button" className="btn" data-pics-close onClick={closePics}>× {t('close')}</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', background: '#222', padding: 8 }}>
            {pics.urls.map((u, i) => (
              <img key={u} src={u} alt={`${i + 1}`} data-pic style={{ display: 'block', width: '100%', maxWidth: 520, margin: '0 auto 12px', background: '#fff' }} />
            ))}
          </div>
        </div>
      )}
      {previewHtml !== null && (
        <div className="modal" data-preview-modal>
          <div className="bar">
            <button type="button" className="btn" data-preview-close onClick={() => setPreviewHtml(null)}>× {t('close')}</button>
          </div>
          <iframe title="booklet preview" sandbox="allow-scripts allow-popups" srcDoc={previewHtml} />
        </div>
      )}
    </>
  );
}


/* ───────────── Zadnja stranica (kako naručiti + kontakt) ───────────── */
function LastPageEditor({ t, lang, draft, update }: { t: TFn; lang: BookletLang; draft: BookletDraft; update: (fn: (d: BookletDraft) => BookletDraft) => void }) {
  const [place, setPlace] = useState('');
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const L = LABELS[lang];
  const applyTemplate = () => {
    if (draft.steps.length > 0 && !armed) {
      setArmed(true);
      setMsg({ text: t('tplSure'), ok: false });
      window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    update((d) => ({ ...d, ...boatTripPreset(d.lang, place) }));
    setMsg({ text: t('tplDone'), ok: true });
  };
  const setStep = (i: number, patch: Partial<{ title: string; desc: string }>) => update((d) => ({ ...d, steps: d.steps.map((st, j) => (j === i ? { ...st, ...patch } : st)) }));
  return (
    <div className="card" data-last-page>
      <h2>{t('lastPage')}</h2>
      <p className="hint">{t('lastPageHint')}</p>
      <label className="f">
        <span>{t('orderHeading')}</span>
        <input type="text" data-order-heading placeholder={L.orderHeading} value={draft.orderHeading} maxLength={120} onChange={(e) => update((d) => ({ ...d, orderHeading: e.target.value }))} />
      </label>

      <div className="page" data-template>
        <b style={{ fontSize: 13 }}>{t('tplTitle')}</b>
        <p className="hint">{t('tplHint')}</p>
        <div className="row">
          <input className="grow" type="text" data-tpl-place placeholder={t('tplPlace')} aria-label={t('tplPlace')} value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} />
          <button type="button" className={`btn ${armed ? 'danger-armed' : ''}`} data-tpl-apply onClick={applyTemplate}>{t('tplApply')}</button>
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </div>

      <label className="f">
        <span>{t('stepsTitle')}</span>
        <input type="text" data-steps-title value={draft.stepsTitle} maxLength={120} onChange={(e) => update((d) => ({ ...d, stepsTitle: e.target.value }))} />
      </label>
      <label className="f">
        <span>{t('stepsBadge')}</span>
        <input type="text" data-steps-badge value={draft.stepsBadge} maxLength={80} onChange={(e) => update((d) => ({ ...d, stepsBadge: e.target.value }))} />
      </label>
      {draft.steps.map((st, i) => (
        <div key={i} className="page" data-step>
          <div className="row" style={{ marginBottom: 6 }}>
            <b className="grow" style={{ fontSize: 13 }}>{i + 1}. {t('stepTitle')}</b>
            <button type="button" className="btn small" aria-label={t('remove')} onClick={() => update((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))}>{t('remove')}</button>
          </div>
          <input type="text" aria-label={t('stepTitle')} value={st.title} maxLength={120} onChange={(e) => setStep(i, { title: e.target.value })} style={{ marginBottom: 6 }} />
          <input type="text" aria-label={t('stepDesc')} placeholder={t('stepDesc')} value={st.desc} maxLength={300} onChange={(e) => setStep(i, { desc: e.target.value })} />
        </div>
      ))}
      <button type="button" className="btn" data-add-step disabled={draft.steps.length >= 6} onClick={() => update((d) => ({ ...d, steps: [...d.steps, { title: '', desc: '' }] }))}>+ {t('addStep')}</button>

      <label className="f" style={{ marginTop: 12 }}>
        <span>{t('waMessage')}</span>
        <textarea data-wa-message placeholder={L.waHello} value={draft.waMessage} maxLength={600} onChange={(e) => update((d) => ({ ...d, waMessage: e.target.value }))} />
      </label>
      <label className="f">
        <span>{t('orderNote')}</span>
        <textarea data-order-note value={draft.orderNote} maxLength={2000} onChange={(e) => update((d) => ({ ...d, orderNote: e.target.value }))} />
      </label>
    </div>
  );
}


/* ───────────── Letci ───────────── */
const fileSlug = (s: string) => (s.normalize('NFKD').replace(/[^\x00-\x7F]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Flyer').slice(0, 40);

function FlyersTab({ t, lang, items, settings, flyers, setFlyers }: { t: TFn; lang: BookletLang; items: Item[]; settings: Settings; flyers: Flyer[]; setFlyers: (f: (s: Flyer[]) => Flyer[]) => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const editing = flyers.find((f) => f.id === editId) ?? null;
  const itemName = (f: Flyer) => f.name || f.title || t('flyerUntitled');

  const remove = (id: string) => {
    if (confirm !== id) {
      setConfirm(id);
      window.setTimeout(() => setConfirm((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirm(null);
    setFlyers((all) => all.filter((f) => f.id !== id));
  };

  if (editing) return <FlyerEditor t={t} items={items} settings={settings} flyer={editing} onBack={() => setEditId(null)} onChange={(f) => setFlyers((all) => all.map((x) => (x.id === f.id ? f : x)))} />;

  return (
    <>
      <div className="card">
        <h2>{t('tabFlyers')}</h2>
        <p className="hint">{t('flyersHint')}</p>
        <button
          type="button"
          className="btn primary"
          data-new-flyer
          onClick={() => {
            const f = newFlyer(lang, new Set(flyers.map((x) => x.id)));
            setFlyers((all) => [...all, f]);
            setEditId(f.id);
          }}
        >
          + {t('newFlyer')}
        </button>
      </div>
      {flyers.length === 0 ? (
        <p className="empty" data-no-flyers>{t('noFlyers')}</p>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
          {flyers.map((f) => (
            <div key={f.id} className="shoe" data-flyer={f.id}>
              <div className="meta">
                <b>{itemName(f)}</b>
                <span>{t(f.layout === 'feature' ? 'layoutFeature' : f.layout === 'two' ? 'layoutTwo' : 'layoutGrid4')} · {f.paper}</span>
              </div>
              <div className="acts">
                <button type="button" className="btn small" data-edit-flyer onClick={() => setEditId(f.id)}>{t('edit')}</button>
                <button type="button" className="btn small" data-copy-flyer onClick={() => setFlyers((all) => [...all, { ...f, id: newFlyer(lang, new Set(all.map((x) => x.id))).id, name: `${itemName(f)} (2)` }])}>{t('duplicate')}</button>
                <button type="button" className={`btn small ${confirm === f.id ? 'danger-armed' : ''}`} data-remove-flyer onClick={() => remove(f.id)}>{confirm === f.id ? t('removeSure') : t('remove')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function FlyerEditor({ t, items, settings, flyer, onBack, onChange }: { t: TFn; items: Item[]; settings: Settings; flyer: Flyer; onBack: () => void; onChange: (f: Flyer) => void }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const contact = toContact(settings);
  const model = useMemo(() => flyerModel(flyer, items, contact), [flyer, items, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = flyerIssues(flyer, items);
  const slots = FLYER_SLOTS[flyer.layout];
  const set = (patch: Partial<Flyer>) => onChange({ ...flyer, ...patch });
  const say = (text: string, ok = true) => setMsg({ text, ok });

  // sličica uživo: crta se tek nakon stanke u tipkanju
  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setRendering(true);
    const id = window.setTimeout(() => {
      renderFlyer(model, 0.5)
        .then((b) => {
          if (!alive) return;
          url = URL.createObjectURL(b);
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return url;
          });
          setRendering(false);
        })
        .catch((e) => {
          if (!alive) return;
          setRendering(false);
          say(t('flyerRenderFail', { detail: String(e?.message || e).slice(0, 120) }), false);
        });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setPreviewUrl((old) => (old ? (URL.revokeObjectURL(old), null) : null)), []);

  const full = async (scale: number) => renderFlyer(model, scale);
  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      console.error('Flyer action failed:', e);
      say(t('flyerRenderFail', { detail: String(e?.message || e).slice(0, 120) }), false);
    }
    setBusy(null);
  };
  const slug = fileSlug(flyer.title || flyer.name);
  const hasContent = issues.indexOf('no-items') < 0;

  return (
    <>
      <div className="card" data-flyer-editor>
        <div className="row" style={{ marginBottom: 10 }}>
          <button type="button" className="btn small" data-flyer-back onClick={onBack}>← {t('flyerBack')}</button>
        </div>
        <label className="f"><span>{t('flyerName')}</span><input type="text" value={flyer.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></label>
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <span className="hint" style={{ margin: 0, display: 'block' }}>{t('layoutLabel')}</span>
            <div className="seg">
              {FLYER_LAYOUTS.map((l: FlyerLayout) => (
                <button key={l} type="button" data-layout={l} aria-pressed={flyer.layout === l} onClick={() => {
                  const next = setLayout(flyer, l);
                  const cut = flyer.itemIds.length - next.itemIds.length;
                  onChange(next);
                  if (cut > 0) say(t('layoutCut', { n: cut }), false);
                }}>{t(l === 'feature' ? 'layoutFeature' : l === 'two' ? 'layoutTwo' : 'layoutGrid4')}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="hint" style={{ margin: 0, display: 'block' }}>{t('paper')}</span>
            <div className="seg">
              {(['A4', 'A5'] as const).map((p) => (
                <button key={p} type="button" data-paper={p} aria-pressed={flyer.paper === p} onClick={() => set({ paper: p })}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="hint" style={{ margin: 0, display: 'block' }}>{t('bkLang')}</span>
            <div className="seg">
              {(['th', 'en'] as const).map((l) => (
                <button key={l} type="button" data-flyer-lang={l} aria-pressed={flyer.lang === l} onClick={() => set({ lang: l })}>{l === 'th' ? 'ไทย' : 'English'}</button>
              ))}
            </div>
          </div>
        </div>
        <label className="f"><span>{t('flyerTitle')}</span><input type="text" data-flyer-title value={flyer.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="f"><span>{t('bkSub')}</span><input type="text" value={flyer.subtitle} maxLength={160} onChange={(e) => set({ subtitle: e.target.value })} /></label>
        <label className="f"><span>{t('flyerBody')}</span><textarea style={{ minHeight: 70 }} value={flyer.body} maxLength={1200} onChange={(e) => set({ body: e.target.value })} /></label>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="row" style={{ cursor: 'pointer', fontWeight: 700 }}><input type="checkbox" checked={flyer.showPrices} onChange={(e) => set({ showPrices: e.target.checked })} /> {t('bkShowPrices')}</label>
          <label className="row" style={{ cursor: 'pointer', fontWeight: 700 }}><input type="checkbox" data-flyer-qr checked={flyer.showQr} onChange={(e) => set({ showQr: e.target.checked })} /> {t('flyerShowQr')}</label>
        </div>
        <span className="hint" style={{ margin: 0, display: 'block' }}>{t('flyerItems', { n: flyer.itemIds.length, max: slots })}</span>
        {items.length === 0 && <p className="warn">⚠ {t('noItems')}</p>}
        <div className="pick" style={{ marginTop: 6 }}>
          {items.map((it) => {
            const on = flyer.itemIds.includes(it.id);
            return (
              <label key={it.id} className={on ? 'on' : ''} data-flyer-pick={it.id}>
                <input type="checkbox" checked={on} onChange={() => {
                  const r = toggleFlyerItem(flyer, it.id);
                  if (r.full) return say(t('flyerFull', { max: slots }), false);
                  setMsg(null);
                  onChange(r.flyer);
                }} />
                {it.images[0] ? <img src={it.images[0]} alt="" /> : <span className="ph0" />}
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{it.title || '—'}</span>
              </label>
            );
          })}
        </div>
        {issues.includes('no-items') && <p className="warn" data-flyer-warn>⚠ {t('flyerNoItems')}</p>}
        {issues.includes('missing-items') && <p className="warn">⚠ {t('flyerMissing')}</p>}
      </div>

      <div className="card">
        <div style={{ textAlign: 'center', background: '#eee', padding: 8 }}>
          {previewUrl ? <img src={previewUrl} alt="" data-flyer-preview style={{ maxWidth: '100%', width: 420, background: '#fff', opacity: rendering ? 0.5 : 1 }} /> : <p className="hint">{t('building')}</p>}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" data-flyer-send disabled={busy !== null || !hasContent} onClick={() => run('send', async () => {
            const file = new File([await full(1)], `${slug}.jpg`, { type: 'image/jpeg' });
            const r = await sharePictures([file], flyer.title || flyer.name, '');
            if (r === 'shared') say(t('shared'));
            else if (r === 'unsupported') {
              downloadBlob(file.name, file);
              say(t('flyerSavedInstead'), false);
            }
          })}>{busy === 'send' ? t('building') : t('flyerSend')}</button>
          <button type="button" className="btn" data-flyer-print disabled={busy !== null || !hasContent} onClick={() => run('print', async () => {
            const blob = await full(2);
            if (!printPicture(blob, flyer.paper)) {
              downloadBlob(`${slug}.jpg`, blob);
              say(t('flyerPrintFail'), false);
            } else say(t('flyerPrinting', { paper: flyer.paper }));
          })}>{busy === 'print' ? t('building') : t('flyerPrint', { paper: flyer.paper })}</button>
          <button type="button" className="btn" data-flyer-save disabled={busy !== null || !hasContent} onClick={() => run('save', async () => {
            downloadBlob(`${slug}.jpg`, await full(2));
            say(t('flyerSaved'));
          })}>{busy === 'save' ? t('building') : t('flyerSave')}</button>
        </div>
        {msg && <p data-msg role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </div>
    </>
  );
}

/* ───────────── Postavke ───────────── */
function SettingsTab({ t, settings, setSettings, items, draft, flyers, photos, cloud, onRestore }: { t: TFn; settings: Settings; setSettings: (f: (s: Settings) => Settings) => void; items: Item[]; draft: BookletDraft; flyers: Flyer[]; photos: Record<string, string>; cloud: ReturnType<typeof useCloudSync>; onRestore: (s: Item[], st: Settings, d: BookletDraft, fl: Flyer[]) => void }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const bad = new Set(settingsIssues(settings).map((i) => i.field));

  const saveBackup = () => {
    const b = makeBackup(items, settings, inlinePhotos(draft, usedPhotos(draft, photos)), flyers);
    downloadFile(`booklet-studio-backup-${b.savedAt.slice(0, 10)}.json`, JSON.stringify(b), 'application/json');
    setMsg({ text: t('backupSaved'), ok: true });
  };
  // Učitavanje briše sve trenutno: datoteka se prvo samo ODABERE, a čita se tek nakon potvrde.
  const apply = async (f: File) => {
    const r = parseBackup(await f.text());
    setPending(null);
    if (!r.ok) return setMsg({ text: t(r.reason === 'not-json' ? 'backupBadJson' : r.reason === 'newer' ? 'backupNewer' : 'backupNotOurs'), ok: false });
    onRestore(r.items, r.settings, r.draft, r.flyers);
    setMsg({ text: t('backupLoaded', { n: r.items.length }), ok: true });
  };

  return (
    <>
      <CloudCard t={t} cloud={cloud} />
      <div className="card">
        <h2>{t('contact')}</h2>
        <label className="f"><span>{t('business')}</span><input type="text" value={settings.businessName} onChange={set('businessName')} /></label>
        <label className="f"><span>{t('owner')}</span><input type="text" value={settings.ownerName} onChange={set('ownerName')} /></label>
        <label className="f"><span>{t('phone')}</span><input type="tel" value={settings.phone} onChange={set('phone')} />{bad.has('phone') && <span className="err" data-bad="phone">{t('badPhone')}</span>}</label>
        <label className="f"><span>{t('whatsapp')}</span><input type="tel" data-whatsapp value={settings.whatsapp} onChange={set('whatsapp')} />{bad.has('whatsapp') && <span className="err" data-bad="whatsapp">{t('badPhone')}</span>}</label>
        <label className="f"><span>{t('lineUrl')}</span><input type="url" value={settings.lineUrl} onChange={set('lineUrl')} />{bad.has('lineUrl') && <span className="err" data-bad="lineUrl">{t('badUrl')}</span>}</label>
        <label className="f"><span>{t('lineDisplay')}</span><input type="text" value={settings.lineDisplay} onChange={set('lineDisplay')} /></label>
        <label className="f"><span>{t('email')}</span><input type="email" value={settings.email} onChange={set('email')} /></label>
        <label className="f"><span>{t('shopUrl')}</span><input type="url" data-shop-url value={settings.shopUrl} onChange={set('shopUrl')} />{bad.has('shopUrl') && <span className="err" data-bad="shopUrl">{t('badUrl')}</span>}</label>
      </div>
      <div className="card">
        <h2>{t('uiLang')}</h2>
        <div className="seg">
          {(['th', 'en'] as const).map((l) => (
            <button key={l} type="button" data-ui-lang={l} aria-pressed={settings.uiLang === l} onClick={() => setSettings((s) => ({ ...s, uiLang: l }))}>{l === 'th' ? 'ไทย' : 'English'}</button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 12 }}>{t('install')}</p>
      </div>
      <div className="card">
        <h2>{t('backup')}</h2>
        <p className="hint">{t('backupHint')}</p>
        <div className="row">
          <button type="button" className="btn" data-backup-save onClick={saveBackup}>{t('backupSave')}</button>
          <button type="button" className="btn" data-backup-load onClick={() => file.current?.click()}>{t('backupLoad')}</button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            data-backup-input
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              if (f) {
                setPending(f);
                setMsg({ text: t('backupReplace'), ok: false });
              }
            }}
          />
        </div>
        {pending && (
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn danger-armed" data-backup-confirm onClick={() => void apply(pending)}>{t('backupLoad')} ✓</button>
            <button type="button" className="btn" onClick={() => { setPending(null); setMsg(null); }}>{t('cancel')}</button>
          </div>
        )}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'} data-msg>{msg.text}</p>}
      </div>
    </>
  );
}

const cleanPhotos = (raw: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v;
  return out;
};

const cloudChip = (i: CloudInfo): string => (i.status === 'ok' ? 'Sync ✓' : i.status === 'syncing' || i.status === 'loading' ? 'Sync …' : i.status === 'off' || i.status === 'signedout' ? 'Sync' : 'Sync !');
const cloudText = (t: TFn, i: CloudInfo): string =>
  i.status === 'ok' ? t('cloudOk') : i.status === 'syncing' || i.status === 'loading' ? t('cloudSyncing') : i.status === 'offline' ? t('cloudOffline') : i.status === 'denied' ? t('cloudDenied') : i.status === 'error' ? t('cloudError') : t('cloudOff');

/* ───────────── Isti podaci na svim uređajima ───────────── */
function CloudCard({ t, cloud }: { t: TFn; cloud: ReturnType<typeof useCloudSync> }) {
  const { info, signIn, signOut, syncNow } = cloud;
  const signedIn = !!info.email && info.status !== 'signedout' && info.status !== 'off';
  const reason = info.error === 'network' ? t('cloudNet') : info.error === 'popup-blocked' ? t('cloudPopup') : info.error === 'unauthorized-domain' ? t('cloudDomain') : info.error;
  return (
    <div className="card" data-cloud-card>
      <h2>{t('cloudTitle')}</h2>
      <p className="hint">{t('cloudHint')}</p>
      {signedIn ? (
        <>
          <p data-cloud-status role={info.status === 'denied' || info.status === 'error' ? 'alert' : 'status'} className={info.status === 'denied' || info.status === 'error' ? 'err' : 'ok'}>
            {cloudText(t, info)} · {info.email}
            {info.lastAt ? ` · ${new Date(info.lastAt).toLocaleTimeString()}` : ''}
          </p>
          {info.status === 'denied' && <p className="err">{t('cloudDeniedHelp')}</p>}
          {info.tooBig > 0 && <p className="warn" data-cloud-toobig>⚠ {t('cloudTooBig', { n: info.tooBig })}</p>}
          {reason && info.status !== 'denied' && <p className="err" data-cloud-error>{reason}</p>}
          <div className="row">
            <button type="button" className="btn" data-cloud-now disabled={info.status === 'syncing'} onClick={() => void syncNow()}>{t('cloudNow')}</button>
            <button type="button" className="btn" data-cloud-out onClick={() => void signOut()}>{t('cloudOut')}</button>
          </div>
        </>
      ) : (
        <>
          {reason && <p role="alert" className="err" data-cloud-error>{reason}</p>}
          <div className="row">
            <button type="button" className="btn primary" data-cloud-in disabled={info.status === 'loading'} onClick={() => void signIn()}>{info.status === 'loading' ? t('building') : t('cloudIn')}</button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{t('cloudFirst')}</p>
        </>
      )}
    </div>
  );
}
