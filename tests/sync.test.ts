// Usklađivanje između uređaja: lažni poslužitelj, dva „uređaja", sukobi, brisanje, prazan uređaj ne gazi pun, greške.
import assert from 'node:assert/strict';
import { defaultDraft, normalizeDraft } from '../src/lib/booklet';
import { defaultSettings, toBuildInput, makeBackup, parseBackup, type Item } from '../src/lib/studio';
import { newFlyer } from '../src/lib/flyer';
import {
  MAX_PAYLOAD,
  applyChanges,
  emptyMeta,
  externalizePhotos,
  fromRecords,
  hashText,
  inlinePhotos,
  recDocId,
  snapshotOf,
  syncOnce,
  toRecords,
  usedPhotos,
  type Meta,
  type Outgoing,
  type Remote,
  type RemoteDoc,
  type StudioState,
} from '../src/lib/sync';

let failed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    console.log('ok  ', name);
  } catch (e) {
    failed++;
    console.error('FAIL', name, '\n    ', (e as Error).message.split('\n')[0]);
  }
};
const IMG = (n: number) => `data:image/jpeg;base64,${'A'.repeat(8)}${n}`;
const item = (id: string, title: string, n = 1): Item => ({ id, title, price: '฿1', desc: '', images: [IMG(n)] });

/** Lažni poslužitelj: pamti dokumente, vrijeme raste; `>=` kao pravi upit (preklapanje je namjerno). */
class FakeRemote implements Remote {
  docs = new Map<string, RemoteDoc>();
  clock = 1000;
  pulls = 0;
  failPush = false;
  failPull = false;
  async pull(since: number) {
    this.pulls++;
    if (this.failPull) throw new Error('offline');
    return [...this.docs.values()].filter((d) => d.serverAt >= since).map((d) => ({ ...d }));
  }
  async push(docs: Outgoing[]) {
    if (this.failPush) throw new Error('permission-denied');
    for (const d of docs) this.docs.set(d.docId, { ...d, serverAt: ++this.clock });
  }
}

/** Jedan „uređaj": stanje + meta, kao u aplikaciji. */
class Device {
  meta: Meta = emptyMeta('u1');
  constructor(public state: StudioState, public remote: FakeRemote) {}
  async sync() {
    const local = toRecords(this.state);
    const snap = snapshotOf(local);
    const r = await syncOnce(local, this.meta, this.remote);
    this.state = applyChanges(this.state, r.changes, snap, this.state.settings.uiLang);
    this.meta = r.meta;
    return r;
  }
}
const same = (a: unknown, b: unknown) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const blank = (lang: 'th' | 'en' = 'en'): StudioState => ({ items: [], flyers: [], draft: defaultDraft(lang), settings: defaultSettings(lang), photos: {} });
const filled = (): StudioState => {
  const s = blank();
  s.items = [item('a', 'Alpha'), item('b', 'Beta', 2), item('c', 'Gamma', 3)];
  s.settings = { ...s.settings, businessName: 'Parry', whatsapp: '+66945411179' };
  s.photos = { phone: IMG(9) };
  s.draft = { ...s.draft, title: 'My book', pages: [{ id: 'p1', type: 'photos', heading: '', items: [{ ref: 'phone', caption: 'hi' }], note: '' }, { id: 'p2', type: 'shoes', heading: '', shoeIds: ['a', 'b'], note: '' }] };
  s.flyers = [{ ...newFlyer('en'), id: 'fly1', title: 'Sale', itemIds: ['a'] }];
  return s;
};

(async () => {
  await t('hashText: isti tekst isti otisak, drukčiji tekst drukčiji', () => {
    assert.equal(hashText('abc'), hashText('abc'));
    assert.notEqual(hashText('abc'), hashText('abd'));
    assert.notEqual(hashText(''), hashText('a'));
  });

  await t('fotografije: stari zapis (data: u ref) → id; vraćanje daje istu sliku; bez promjene vraća ISTE objekte', () => {
    const s = filled();
    const old = { ...s.draft, pages: [{ id: 'p1', type: 'photos' as const, heading: '', items: [{ ref: IMG(5), caption: 'x' }, { ref: IMG(5), caption: 'y' }], note: '' }] };
    const r = externalizePhotos(old, {});
    const refs = (r.draft.pages[0] as any).items.map((i: any) => i.ref);
    assert.ok(refs.every((x: string) => !x.startsWith('data:')));
    assert.equal(refs[0], refs[1], 'ista slika dvaput = jedan zapis');
    assert.equal(Object.keys(r.photos).length, 1);
    const back = inlinePhotos(r.draft, r.photos);
    assert.equal((back.pages[0] as any).items[0].ref, IMG(5));
    const again = externalizePhotos(r.draft, r.photos);
    assert.equal(again.draft, r.draft);
    assert.equal(again.photos, r.photos);
  });

  await t('usedPhotos: slika koju nijedna stranica ne koristi ne ide dalje', () => {
    const s = filled();
    assert.deepEqual(Object.keys(usedPhotos(s.draft, { ...s.photos, stray: IMG(7) })), ['phone']);
  });

  await t('toBuildInput: knjižica dobiva sliku po id-u, a stari data: zapis i dalje radi', () => {
    const s = filled();
    assert.equal(toBuildInput(s.draft, s.items, s.settings, s.photos).photos.phone, IMG(9));
    const old = { ...s.draft, pages: [{ id: 'p1', type: 'photos' as const, heading: '', items: [{ ref: IMG(4), caption: '' }], note: '' }] };
    assert.equal(toBuildInput(old, s.items, s.settings, {}).photos[IMG(4)], IMG(4));
  });

  await t('zapisi: kružno stanje → zapisi → stanje je isto (redoslijed, postavke, uiLang ostaje lokalan)', () => {
    const s = filled();
    const recs = new Map(toRecords(s).map((r) => [recDocId(r), r] as const));
    const back = fromRecords(recs, { ...blank('th') }, 'th');
    same(back.items, s.items);
    same(back.flyers, s.flyers);
    same(back.draft, s.draft);
    same(back.photos, s.photos);
    assert.equal(back.settings.businessName, 'Parry');
    assert.equal(back.settings.uiLang, 'th', 'jezik sučelja se ne prenosi s drugog uređaja');
  });

  await t('zapisi: prazan uređaj ima samo početne (pristine) zapise', () => {
    const recs = toRecords(blank());
    assert.ok(recs.every((r) => r.pristine));
    assert.equal(recs.length, 3);
  });

  await t('prvi uređaj šalje sve; drugi, prazan, povuče sve i dobije isto', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    const r = await a.sync();
    assert.equal(r.pushed, 8, '3 stavke + letak + slika + knjižica + postavke + redoslijed');
    const b = new Device(blank('th'), remote);
    await b.sync();
    same(b.state.items, a.state.items);
    same(b.state.flyers, a.state.flyers);
    same(b.state.draft, a.state.draft);
    same(b.state.photos, a.state.photos);
    assert.equal(b.state.settings.businessName, 'Parry');
    assert.equal(b.state.settings.uiLang, 'th');
  });

  await t('prazan novi uređaj NE gazi podatke na poslužitelju (početna knjižica/postavke se ne šalju)', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    await a.sync();
    const before = JSON.stringify([...remote.docs.entries()].map(([k, v]) => [k, v.payload, v.deleted]));
    const b = new Device(blank(), remote);
    const r = await b.sync();
    assert.equal(r.pushed, 0);
    assert.equal(JSON.stringify([...remote.docs.entries()].map(([k, v]) => [k, v.payload, v.deleted])), before);
    assert.equal(b.state.draft.title, 'My book');
  });

  await t('drugi krug bez izmjena: ništa se ne šalje i ništa se ne mijenja', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    await a.sync();
    const r = await a.sync();
    assert.equal(r.pushed, 0);
    assert.equal(r.changes.upserts.length, 0);
    assert.equal(r.changes.deletes.length, 0);
  });

  await t('izmjena na jednom uređaju stigne na drugi; šalje se samo to što je izmijenjeno', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    const b = new Device(blank(), remote);
    await a.sync();
    await b.sync();
    a.state = { ...a.state, items: a.state.items.map((i) => (i.id === 'b' ? { ...i, title: 'Beta 2' } : i)) };
    const r = await a.sync();
    assert.equal(r.pushed, 1);
    await b.sync();
    assert.equal(b.state.items.find((i) => i.id === 'b')?.title, 'Beta 2');
  });

  await t('brisanje i premještanje: obrisana stavka nestaje i na drugom uređaju; redoslijed se prenosi', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    const b = new Device(blank(), remote);
    await a.sync();
    await b.sync();
    a.state = { ...a.state, items: [a.state.items[2], a.state.items[0]] }; // b obrisan, c ispred a
    await a.sync();
    assert.equal(remote.docs.get('item__b')?.deleted, true, 'nadgrobna oznaka, ne pravo brisanje');
    await b.sync();
    assert.deepEqual(b.state.items.map((i) => i.id), ['c', 'a']);
  });

  await t('sukob: lokalna izmjena pobjeđuje povučenu istog zapisa, a tuđa izmjena drugog zapisa se prima', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    const b = new Device(blank(), remote);
    await a.sync();
    await b.sync();
    a.state = { ...a.state, items: a.state.items.map((i) => (i.id === 'a' ? { ...i, title: 'from A' } : i)) };
    await a.sync();
    b.state = { ...b.state, items: b.state.items.map((i) => (i.id === 'a' ? { ...i, title: 'from B' } : i.id === 'c' ? { ...i, title: 'C by B' } : i)) };
    // b još nije povukao A-ovu izmjenu: ona i njegova su istodobne
    await b.sync();
    assert.equal(b.state.items.find((i) => i.id === 'a')?.title, 'from B');
    await a.sync();
    assert.equal(a.state.items.find((i) => i.id === 'a')?.title, 'from B', 'zadnji koji pošalje pobjeđuje');
    assert.equal(a.state.items.find((i) => i.id === 'c')?.title, 'C by B');
  });

  await t('uređaj koji je obrisao stavku ne dobiva je natrag kad je netko drugi izmijeni (lokalno pobjeđuje)', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    const b = new Device(blank(), remote);
    await a.sync();
    await b.sync();
    b.state = { ...b.state, items: b.state.items.filter((i) => i.id !== 'a') };
    a.state = { ...a.state, items: a.state.items.map((i) => (i.id === 'a' ? { ...i, title: 'edited' } : i)) };
    await a.sync();
    await b.sync();
    assert.ok(!b.state.items.some((i) => i.id === 'a'));
    assert.equal(remote.docs.get('item__a')?.deleted, true);
  });

  await t('greška povlačenja: baca se, ništa se ne mijenja', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    remote.failPull = true;
    await assert.rejects(() => a.sync(), /offline/);
    assert.deepEqual(a.meta, emptyMeta('u1'));
  });

  await t('greška slanja: povučeno se primjenjuje, ali meta NE tvrdi da je poslano — sljedeći krug pokušava ponovno', async () => {
    const remote = new FakeRemote();
    const a = new Device(filled(), remote);
    remote.failPush = true;
    const r = await a.sync();
    assert.match(r.pushError ?? '', /permission-denied/);
    assert.equal(r.pushed, 0);
    remote.failPush = false;
    const r2 = await a.sync();
    assert.ok(r2.pushed > 0);
    assert.equal(remote.docs.size, r2.pushed);
  });

  await t('preveliki zapis se ne šalje (javlja se), ostali prolaze', async () => {
    const remote = new FakeRemote();
    const s = filled();
    s.items = [...s.items, { id: 'big', title: 'Big', price: '', desc: '', images: ['data:image/jpeg;base64,' + 'A'.repeat(MAX_PAYLOAD + 10)] }];
    const a = new Device(s, remote);
    const r = await a.sync();
    assert.deepEqual(r.tooBig, ['item__big']);
    assert.ok(!remote.docs.has('item__big'));
    assert.ok(remote.docs.has('item__a'));
  });

  await t('zapisi se šalju redom: slike i stavke prije knjižice i redoslijeda', async () => {
    const remote = new FakeRemote();
    const seen: string[] = [];
    const orig = remote.push.bind(remote);
    remote.push = async (d) => {
      seen.push(...d.map((x) => x.kind));
      return orig(d);
    };
    await new Device(filled(), remote).sync();
    assert.ok(seen.indexOf('photo') < seen.indexOf('draft'));
    assert.ok(seen.indexOf('item') < seen.indexOf('order'));
  });

  await t('applyChanges: što je korisnik promijenio dok je sinkronizacija trajala, ne gazi se', () => {
    const s = filled();
    const snap = snapshotOf(toRecords(s));
    const edited = { ...s, items: s.items.map((i) => (i.id === 'a' ? { ...i, title: 'typed meanwhile' } : i)) };
    const remoteVersion = { kind: 'item' as const, id: 'a', payload: JSON.stringify({ ...s.items[0], title: 'from remote' }) };
    const out = applyChanges(edited, { upserts: [remoteVersion], deletes: [] }, snap, 'en');
    assert.equal(out.items.find((i) => i.id === 'a')?.title, 'typed meanwhile');
    const out2 = applyChanges(s, { upserts: [remoteVersion], deletes: [] }, snap, 'en');
    assert.equal(out2.items.find((i) => i.id === 'a')?.title, 'from remote');
  });

  await t('drugi račun: meta s drugim uid-om se ne koristi (aplikacija ju ponovno pokreće) — emptyMeta nema ničega usklađenog', () => {
    const m = emptyMeta('u2');
    assert.equal(m.since, 0);
    assert.deepEqual(m.hashes, {});
  });

  await t('sigurnosna kopija: fotografije stranica idu natrag kao data: adrese, pa se vraćaju kroz migraciju', () => {
    const s = filled();
    const b = makeBackup(s.items, s.settings, inlinePhotos(s.draft, s.photos), s.flyers);
    const r = parseBackup(JSON.stringify(b));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal((r.draft.pages[0] as any).items[0].ref, IMG(9));
    const m = externalizePhotos(r.draft, {});
    assert.ok(!(m.draft.pages[0] as any).items[0].ref.startsWith('data:'));
    assert.equal(Object.values(m.photos)[0], IMG(9));
  });

  await t('normalizeDraft čuva kratke id-ove fotografija', () => {
    const d = normalizeDraft({ pages: [{ id: 'x', type: 'photos', items: [{ ref: 'ph123', caption: '' }] }] }, 'en');
    assert.equal((d.pages[0] as any).items[0].ref, 'ph123');
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nsve prošlo');
})();
