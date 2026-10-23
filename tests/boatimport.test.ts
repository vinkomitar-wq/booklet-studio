// Uvoz brodova: čitanje flote, adrese slika, opis, bez imena operatora, djelomične slike, ponovni uvoz (lažni dohvat, bez mreže).
import assert from 'node:assert/strict';
import { boatDesc, isFleetItem, isShopItem, parseFleet, resolveBoatImage, runBoatImport } from '../src/lib/boatImport';
import type { Item } from '../src/lib/studio';

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
const IMG = (n: string) => `data:image/jpeg;base64,${n}`;
const fleet = [
  { id: 'the-best', name: 'The Best', model: 'Catlante 600', capacity: 12, images: ['/fleet/the-best-hero.jpg', '/fleet/the-best-bay.jpg'], company: 'SECRET OPERATOR LTD', isCustomBy: 'Secret Agent' },
  { id: 'namaste', name: 'Namaste', model: 'Imp 55', capacity: 0, images: ['https://images.boatsgroup.com/a.jpg'] },
  { id: 'nona', name: 'MV Nona', model: '', capacity: 8, images: [IMG('N')] },
  { id: 'empty', name: 'Empty', images: [] },
  { id: 'single', name: 'Single', image: '/fleet/s.jpg' },
  { id: 'evil', name: 'Evil', images: ['javascript:alert(1)', '//evil.example/x.jpg'] },
  { id: 'the-best', name: 'Duplicate' },
  null,
  { name: 'no id' },
];
const ok: Record<string, string> = { 'https://thailandboattours.com/fleet/the-best-hero.jpg': IMG('H'), 'https://thailandboattours.com/fleet/the-best-bay.jpg': IMG('B'), 'https://thailandboattours.com/fleet/s.jpg': IMG('S') };
const fetchImage = async (url: string) => {
  if (url.startsWith('data:image/')) return url;
  if (ok[url]) return ok[url];
  throw new TypeError('blocked by CORS');
};
let n = 0;
const nid = (taken: Set<string>) => {
  let id;
  do id = `b${++n}`;
  while (taken.has(id));
  return id;
};

(async () => {
  await t('parseFleet: preskače smeće i duplikate; `image` je rezerva za `images`', () => {
    const f = parseFleet(fleet);
    assert.deepEqual(f.map((b) => b.id), ['the-best', 'namaste', 'nona', 'empty', 'single', 'evil']);
    assert.deepEqual(f.find((b) => b.id === 'single')!.images, ['/fleet/s.jpg']);
    assert.deepEqual(parseFleet(undefined), []);
  });

  await t('resolveBoatImage: putanja na stranici se dopunjuje, opasno se odbacuje', () => {
    assert.equal(resolveBoatImage('/fleet/x.jpg'), 'https://thailandboattours.com/fleet/x.jpg');
    assert.equal(resolveBoatImage('https://a.b/c.jpg'), 'https://a.b/c.jpg');
    assert.equal(resolveBoatImage(IMG('1')), IMG('1'));
    assert.equal(resolveBoatImage('http://insecure/c.jpg'), '');
    assert.equal(resolveBoatImage('//evil.example/x.jpg'), '');
    assert.equal(resolveBoatImage('javascript:alert(1)'), '');
  });

  await t('boatDesc: samo ono što postoji', () => {
    assert.equal(boatDesc({ model: 'Catlante 600', capacity: 12 }), 'Catlante 600 · up to 12 guests');
    assert.equal(boatDesc({ model: '', capacity: 8 }), 'up to 8 guests');
    assert.equal(boatDesc({ model: 'Imp 55', capacity: 0 }), 'Imp 55');
    assert.equal(boatDesc({ model: '', capacity: 0 }), '');
  });

  await t('runBoatImport: uvozi brodove, ime operatora NIGDJE u stavci', async () => {
    const r = await runBoatImport([], async () => fleet, fetchImage, nid);
    const titles = r.added.map((i) => i.title).sort();
    assert.deepEqual(titles, ['MV Nona', 'The Best', 'Single'].sort());
    const best = r.added.find((i) => i.title === 'The Best')!;
    assert.equal(best.shopId, 'fleet:the-best');
    assert.deepEqual(best.images, [IMG('H'), IMG('B')]);
    assert.equal(best.desc, 'Catlante 600 · up to 12 guests');
    assert.equal(best.price, '');
    assert.ok(!JSON.stringify(r.added).match(/SECRET|Secret/), 'operator se ne prenosi');
    assert.ok(isFleetItem(best) && !isShopItem(best));
  });

  await t('runBoatImport: brod kojem je slika blokirana javlja se imenom; djelomično se broji', async () => {
    const r = await runBoatImport([], async () => fleet, fetchImage, nid);
    assert.deepEqual(r.noImage.sort(), ['Empty', 'Evil', 'Namaste'].sort(), 'Namaste: CORS blokiran; Empty/Evil: nema upotrebljive slike');
    const r2 = await runBoatImport([], async () => [{ id: 'x', name: 'X', images: ['/fleet/the-best-hero.jpg', 'https://blocked.example/z.jpg'] }], fetchImage, nid);
    assert.equal(r2.added.length, 1);
    assert.equal(r2.partial, 1);
  });

  await t('runBoatImport: ponovni uvoz ne dira uvezeno i ne dohvaća slike', async () => {
    const first = await runBoatImport([], async () => fleet, fetchImage, nid);
    let calls = 0;
    const again = await runBoatImport(first.added, async () => fleet, async (u) => (calls++, fetchImage(u)), nid);
    assert.equal(again.added.length, 0);
    assert.equal(again.already, first.added.length);
    assert.equal(calls, 1, 'uvezeni brodovi se ne dohvaćaju ponovno; samo Namaste (blokiran) se pokušava opet');
  });

  await t('runBoatImport: cipele (shopId bez prefiksa) i ručne stavke ne smetaju', async () => {
    const shoe: Item = { id: 's', title: 'Shoe', price: '', desc: '', images: [IMG('x')], shopId: 'abc' };
    const r = await runBoatImport([shoe], async () => fleet, fetchImage, nid);
    assert.equal(r.added.length, 3);
    assert.ok(isShopItem(shoe) && !isFleetItem(shoe));
  });

  await t('runBoatImport: greška čitanja flote se baca', async () => {
    await assert.rejects(() => runBoatImport([], async () => { throw new Error('offline'); }, fetchImage, nid), /offline/);
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nsve prošlo');
})();
