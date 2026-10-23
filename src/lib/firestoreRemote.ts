/** Čitanje i pisanje zapisa u Firestore kolekciju `studio` (po upitu „što je novo", bez slušatelja). Odvojeno od prijave da se može isprobati na emulatoru. */
import { Timestamp, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, startAfter, where, writeBatch, type Firestore, type QueryDocumentSnapshot } from 'firebase/firestore';
import { KINDS, type Kind, type Outgoing, type Remote, type RemoteDoc } from './sync';

const COLLECTION = 'studio';
const PAGE = 40; // fotografije su velike: povlači se po malo
const BATCH_BYTES = 2_500_000; // jedna objava smije imati do 10 MiB; držimo se daleko ispod
const BATCH_OPS = 100;

const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);

export const makeRemote = (db: Firestore): Remote => ({
  async pull(sinceMs: number): Promise<RemoteDoc[]> {
    const out: RemoteDoc[] = [];
    let last: QueryDocumentSnapshot | undefined;
    for (let page = 0; page < 200; page++) {
      const base = [where('serverAt', '>=', Timestamp.fromMillis(sinceMs)), orderBy('serverAt'), limit(PAGE)] as const;
      const snap = await getDocs(last ? query(collection(db, COLLECTION), ...base, startAfter(last)) : query(collection(db, COLLECTION), ...base));
      for (const d of snap.docs) {
        const x = d.data();
        if (!isKind(x.kind) || typeof x.payload !== 'string' || !(x.serverAt instanceof Timestamp)) continue; // tuđi/oštećeni zapis
        out.push({ docId: d.id, kind: x.kind, payload: x.payload, deleted: x.deleted === true, serverAt: x.serverAt.toMillis() });
      }
      if (snap.docs.length < PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
    return out;
  },

  async push(docs: Outgoing[]): Promise<void> {
    let batch = writeBatch(db);
    let ops = 0;
    let bytes = 0;
    const flush = async () => {
      if (ops > 0) await batch.commit();
      batch = writeBatch(db);
      ops = 0;
      bytes = 0;
    };
    for (const d of docs) {
      if (ops >= BATCH_OPS || (ops > 0 && bytes + d.payload.length > BATCH_BYTES)) await flush();
      batch.set(doc(db, COLLECTION, d.docId), { kind: d.kind, payload: d.payload, deleted: d.deleted, serverAt: serverTimestamp() });
      ops++;
      bytes += d.payload.length;
    }
    await flush();
  },
});
