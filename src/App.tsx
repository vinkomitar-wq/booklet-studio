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
import { baseName, downloadBlob, downloadFile, pictureFiles, prepare, shareFile, sharePictures, zipPictures } from './lib/export';
import { renderBookletImages } from './lib/render';
import { photoToDataUrl } from './lib/images';
import { Settings, Item, boatTripPreset, defaultSettings, makeBackup, newId, normalizeSettings, normalizeItems, parseBackup, settingsIssues, toBuildInput, toContact } from './lib/studio';
import { Key, tr } from './i18n';

type Tab = 'items' | 'booklet' | 'settings';
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
  const [loaded, setLoaded] = useState<{ items: Item[]; settings: Settings; draft: BookletDraft } | null>(null);
  const [fatal, setFatal] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const lang = settings.uiLang;
  const t = useCallback<TFn>((k, v) => tr(lang, k, v), [lang]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, st, d] = await Promise.all([dbGet('shoes'), dbGet('settings'), dbGet('draft')]);
        if (!alive) return;
        const ls = normalizeItems(s);
        const lset = normalizeSettings(st, guessLang());
        const ld = normalizeDraft(d, lset.uiLang);
        setItems(ls);
        setSettings(lset);
        setDraft(ld);
        setLoaded({ items: ls, settings: lset, draft: ld });
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
        <nav className="tabs">
          {(['items', 'booklet', 'settings'] as Tab[]).map((k) => (
            <button key={k} type="button" className="tab" aria-pressed={tab === k} data-tab={k} onClick={() => setTab(k)}>
              {t(k === 'items' ? 'tabItems' : k === 'booklet' ? 'tabBooklet' : 'tabSettings')}
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
      {tab === 'booklet' && <BookletTab t={t} items={items} settings={settings} draft={draft} setDraft={setDraft} />}
      {tab === 'settings' && (
        <SettingsTab
          t={t}
          settings={settings}
          setSettings={setSettings}
          items={items}
          draft={draft}
          onRestore={(s, st, d) => {
            setItems(s);
            setSettings(st);
            setDraft(d);
            // zapiši odmah: povratak ne smije ovisiti o stanci autospremanja
            void Promise.all([dbSet('shoes', s), dbSet('settings', st), dbSet('draft', d)]).catch(onSaveError);
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
          <input ref={many} type="file" accept="image/*" multiple hidden data-many-input onChange={(e) => { void addMany(e.target.files); e.target.value = ''; }} />
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </div>
      {items.length === 0 ? (
        <p className="empty" data-empty>{t('noItems')}</p>
      ) : (
        <div className="grid">
          {items.map((s) => (
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
function BookletTab({ t, items, settings, draft, setDraft }: { t: TFn; items: Item[]; settings: Settings; draft: BookletDraft; setDraft: (f: (d: BookletDraft) => BookletDraft) => void }) {
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
      const refs: string[] = [];
      for (const f of Array.from(files)) refs.push(await photoToDataUrl(f));
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
      const b = prepare(toBuildInput(draft, items, settings));
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
      const blobs = await renderBookletImages(toBuildInput(draft, items, settings));
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
                      <div className="ph"><img src={it.ref} alt="" /></div>
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

/* ───────────── Postavke ───────────── */
function SettingsTab({ t, settings, setSettings, items, draft, onRestore }: { t: TFn; settings: Settings; setSettings: (f: (s: Settings) => Settings) => void; items: Item[]; draft: BookletDraft; onRestore: (s: Item[], st: Settings, d: BookletDraft) => void }) {
  const [msg, setMsg] = useState<Msg | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setSettings((s) => ({ ...s, [k]: e.target.value }));
  const bad = new Set(settingsIssues(settings).map((i) => i.field));

  const saveBackup = () => {
    const b = makeBackup(items, settings, draft);
    downloadFile(`booklet-studio-backup-${b.savedAt.slice(0, 10)}.json`, JSON.stringify(b), 'application/json');
    setMsg({ text: t('backupSaved'), ok: true });
  };
  // Učitavanje briše sve trenutno: datoteka se prvo samo ODABERE, a čita se tek nakon potvrde.
  const apply = async (f: File) => {
    const r = parseBackup(await f.text());
    setPending(null);
    if (!r.ok) return setMsg({ text: t(r.reason === 'not-json' ? 'backupBadJson' : r.reason === 'newer' ? 'backupNewer' : 'backupNotOurs'), ok: false });
    onRestore(r.items, r.settings, r.draft);
    setMsg({ text: t('backupLoaded', { n: r.items.length }), ok: true });
  };

  return (
    <>
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
