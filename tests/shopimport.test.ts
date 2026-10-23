// Uvoz iz web-dućana: čitanje popisa, cijena, preskakanje uvezenih/skrivenih, slike, greške mreže (lažni dohvat, bez mreže).
import assert from 'node:assert/strict';
import { MAX_PAYLOAD } from '../src/lib/sync';
import { parseShopCollection, pickImages, planImport, runShopImport, shopPriceText } from '../src/lib/shopImport';
import { normalizeItems, type Item } from '../src/lib/studio';

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
const raw = [
  { id: 's1', title: ' Sea views ', images: ['img:a1', 'img:a2'], visible: true, price: 699, sizePricing: 'same' },
  { id: 's2', title: 'Scout', images: ['img:b1'], visible: true, price: 599, sizePricing: 'bySize', sizeExtras: { '38': 0, '42': 50 } },
  { id: 's3', title: 'Hidden', images: ['img:c1'], visible: false, price: 500 },
  { id: 's4', title: 'No price', images: ['img:d1'], visible: true },
  { id: 's5', title: 'No photos', images: [], visible: true, price: 100 },
  { id: 's6', title: 'Plain data', images: [IMG('P')], visible: true, price: 300 },
  null,
  { title: 'no id' },
];
const store: Record<string, string> = { 'img:a1': IMG('A1'), 'img:a2': IMG('A2'), 'img:b1': IMG('B1'), 'img:c1': IMG('C1'), 'img:d1': IMG('D1') };
let n = 0;
const nid = (taken: Set<string>) => {
  let id;
  do id = `n${++n}`;
  while (taken.has(id));
  return id;
};

(async () => {
  await t('parseShopCollection: preskače smeće, kratko ime, vidljivost zadano da', () => {
    const p = parseShopCollection(raw);
    assert.equal(p.length, 6);
    assert.equal(p[0].title, 'Sea views');
    assert.equal(p.find((x) => x.id === 's3')?.visible, false);
    assert.equal(p.find((x) => x.id === 's4')?.price, undefined);
    assert.deepEqual(parseShopCollection(undefined), []);
    assert.deepEqual(parseShopCollection('x'), []);
  });

  await t('cijena: ista za sve „฿699"; po veličini s različitim doplatama „from"; bez cijene prazno', () => {
    assert.equal(shopPriceText({ price: 699, sizePricing: 'same' }), '฿699');
    assert.equal(shopPriceText({ price: 599, sizePricing: 'bySize', sizeExtras: { '38': 0, '42': 50 } }), 'from ฿599', 'cijena se mijenja po veličini');
    assert.equal(shopPriceText({ price: 599, sizePricing: 'bySize', sizeExtras: { '38': 0, '42': 0 } }), '฿599', 'sve doplate nula = ista cijena');
    assert.equal(shopPriceText({ price: 599, sizePricing: 'bySize', sizeExtras: { '38': -40, '42': 50 } }), 'from ฿559');
    assert.equal(shopPriceText({ price: 599, sizePricing: 'same', sizeExtras: { '38': -40 } }), '฿599', 'ista cijena ignorira doplate');
    assert.equal(shopPriceText({ price: 1234 }), '฿1,234');
    assert.equal(shopPriceText({}), '');
  });

  await t('planImport: skrivene i već uvezene se ne uvoze', () => {
    const shoes = parseShopCollection(raw);
    const plan = planImport([{ shopId: 's1' }, {}], shoes);
    assert.equal(plan.hidden, 1);
    assert.equal(plan.already, 1);
    assert.deepEqual(plan.fresh.map((x) => x.id), ['s2', 's4', 's5', 's6']);
  });

  await t('pickImages: najviše 3, samo prave slike, zbroj ispod granice zapisa', () => {
    assert.deepEqual(pickImages([IMG('1'), 'http://x/y.jpg', IMG('2'), IMG('3'), IMG('4')]), [IMG('1'), IMG('2'), IMG('3')]);
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PAYLOAD - 100_000);
    const two = pickImages([big, big]);
    assert.equal(two.length, 1, 'druga bi probila granicu');
    assert.deepEqual(pickImages([ 'data:image/jpeg;base64,' + 'A'.repeat(MAX_PAYLOAD + 5), IMG('ok')]), [IMG('ok')], 'prevelika prva se preskače, a ne blokira sve');
  });

  await t('runShopImport: uvozi, bilježi shopId, preskače bez slike; slike samo za nove', async () => {
    const reads: string[] = [];
    const r = await runShopImport([], async () => raw, async (ref) => (reads.push(ref), store[ref] ?? ''), nid);
    assert.deepEqual(r.added.map((i) => i.title).sort(), ['No price', 'Plain data', 'Scout', 'Sea views']);
    assert.equal(r.noImage, 1, 'cipela bez slika');
    assert.equal(r.hidden, 1);
    assert.equal(r.failed, 0);
    const sea = r.added.find((i) => i.shopId === 's1')!;
    assert.equal(sea.shopId, 's1');
    assert.equal(sea.price, '฿699');
    assert.deepEqual(sea.images, [IMG('A1'), IMG('A2')]);
    assert.ok(!reads.includes('img:c1'), 'skrivena cipela: slika se ne čita');
    assert.equal(new Set(r.added.map((i) => i.id)).size, r.added.length, 'ids su jedinstveni');
  });

  await t('runShopImport: drugi uvoz ne dira uvezeno i ne čita njihove slike', async () => {
    const first = await runShopImport([], async () => raw, async (ref) => store[ref] ?? '', nid);
    const reads: string[] = [];
    const again = await runShopImport(first.added, async () => raw, async (ref) => (reads.push(ref), store[ref] ?? ''), nid);
    assert.equal(again.added.length, 0);
    assert.equal(again.already, first.added.length);
    assert.deepEqual(reads, [], 'bez novih cipela nema čitanja slika');
  });

  await t('runShopImport: uređena stavka ostaje; ručna stavka bez shopId ne smeta', async () => {
    const edited: Item = { id: 'x', title: 'My own title', price: '฿1', desc: 'edited', images: [IMG('E')], shopId: 's1' };
    const manual: Item = { id: 'y', title: 'Manual', price: '', desc: '', images: [IMG('M')] };
    const r = await runShopImport([edited, manual], async () => raw, async (ref) => store[ref] ?? '', nid);
    assert.ok(!r.added.some((i) => i.shopId === 's1'));
    assert.equal(r.already, 1);
  });

  await t('runShopImport: pad mreže na slici — cipela se NE uvozi napola, a ostale prolaze', async () => {
    const r = await runShopImport(
      [],
      async () => raw,
      async (ref) => {
        if (ref === 'img:b1') throw new Error('network');
        return store[ref] ?? '';
      },
      nid,
    );
    assert.equal(r.failed, 1);
    assert.ok(!r.added.some((i) => i.shopId === 's2'));
    assert.ok(r.added.some((i) => i.shopId === 's1'));
    const retry = await runShopImport(r.added, async () => raw, async (ref) => store[ref] ?? '', nid);
    assert.ok(retry.added.some((i) => i.shopId === 's2'), 'sljedeći pokušaj je preuzme');
  });

  await t('runShopImport: greška čitanja popisa se baca (ne glumi „nema cipela")', async () => {
    await assert.rejects(() => runShopImport([], async () => { throw new Error('offline'); }, async () => '', nid), /offline/);
  });

  await t('runShopImport: nepostojeća slika (prazno) ne ruši; nađe se druga', async () => {
    const r = await runShopImport([], async () => [{ id: 'z', title: 'Z', images: ['img:gone', 'img:a1'], visible: true, price: 1 }], async (ref) => store[ref] ?? '', nid);
    assert.deepEqual(r.added[0].images, [IMG('A1')]);
  });

  await t('shopId preživi normalizeItems (pa i sinkronizaciju i sigurnosnu kopiju)', () => {
    const [i] = normalizeItems([{ id: 'a', title: 'T', images: [IMG('1')], shopId: 's1' }]);
    assert.equal(i.shopId, 's1');
    const [j] = normalizeItems([{ id: 'a', title: 'T', images: [IMG('1')] }]);
    assert.ok(!('shopId' in j));
  });

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log('\nsve prošlo');
})();
