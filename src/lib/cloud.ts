/**
 * Veza s Firebaseom (prijava Google + Firestore). Učitava se tek kad treba (dinamički uvoz), pa aplikacija radi i kad se ovaj dio ne učita.
 * Isti Firebase projekt i ista baza kao dućan (Parry shop); pristup imaju samo administratori dućana (pravila u firestore.rules dućana).
 * Zapisi su u kolekciji `studio`; čita se SAMO upitom „što je novo", bez slušatelja — dnevna kvota čitanja dijeli se s dućanom.
 */
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, getDoc, initializeFirestore } from 'firebase/firestore';
import { makeRemote } from './firestoreRemote';

// Javna web-konfiguracija (ista kao u dućanu; nije tajna — pristup brane pravila baze).
const CONFIG = {
  apiKey: 'AIzaSyCF66MkOHDUceGXOUzNS4MQNiQII1dSc34',
  authDomain: 'payc-141f9.firebaseapp.com',
  projectId: 'payc-141f9',
  appId: '1:245786032645:web:9fdc48202663180f7dba6c',
};
const DB_ID = 'ai-studio-phuketcustomkick-d24a7970-77d9-46a8-8f7d-6548ffc1c198';

const app = initializeApp(CONFIG);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, DB_ID);
// Baza aplikacije thailandboattours.com (isti projekt, druga imenovana baza): flota je javno čitljiva
const PAYC_DB_ID = 'ai-studio-9ef1e50a-1195-4446-b8c2-518eefb30d2e';
const paycDb = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, PAYC_DB_ID);

export interface CloudUser {
  uid: string;
  email: string;
}

/** Javlja trenutnog korisnika (ili null) — i pri pokretanju, kad Firebase vrati prijašnju prijavu. */
export function watchUser(cb: (u: CloudUser | null) => void): () => void {
  return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email ?? '' } : null));
}

export async function signIn(): Promise<void> {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, p);
}

export const signOut = (): Promise<void> => fbSignOut(auth);

export const remote = makeRemote(db);

/** Popis cipela iz web-dućana (jedno čitanje; dokument je javno čitljiv). */
export async function fetchShopCollection(): Promise<unknown> {
  const snap = await getDoc(doc(db, 'app_data', 'main_app_state'));
  return snap.exists() ? snap.data().pck_collection : undefined;
}

/** `img:<id>` → data: adresa slike iz dućana (jedno čitanje po slici). Nepostojeća slika vraća ''; greška mreže se baca. */
export async function fetchShopImage(ref: string): Promise<string> {
  const id = ref.replace(/^img:/, '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return '';
  const snap = await getDoc(doc(db, 'shop_images', id));
  const data = snap.exists() ? snap.data().data : '';
  return typeof data === 'string' ? data : '';
}

/** Popis brodova flote thailandboattours.com (`fleet/vessels`, polje `list`); jedno čitanje. Bez dokumenta vraća undefined. */
export async function fetchFleet(): Promise<unknown> {
  const snap = await getDoc(doc(paycDb, 'fleet', 'vessels'));
  return snap.exists() ? snap.data().list : undefined;
}

/** Knjižnica slika flote (`fleet/photos_library`, polje `photos`): ostale fotografije svakog broda. Bez dokumenta vraća undefined. */
export async function fetchFleetLibrary(): Promise<unknown> {
  const snap = await getDoc(doc(paycDb, 'fleet', 'photos_library'));
  return snap.exists() ? snap.data().photos : undefined;
}
