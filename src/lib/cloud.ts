/**
 * Veza s Firebaseom (prijava Google + Firestore). Učitava se tek kad treba (dinamički uvoz), pa aplikacija radi i kad se ovaj dio ne učita.
 * Isti Firebase projekt i ista baza kao dućan (Parry shop); pristup imaju samo administratori dućana (pravila u firestore.rules dućana).
 * Zapisi su u kolekciji `studio`; čita se SAMO upitom „što je novo", bez slušatelja — dnevna kvota čitanja dijeli se s dućanom.
 */
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
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
