/**
 * Sinkronizacija u aplikaciji: prijava Google, povlačenje i slanje u pozadini, stanje za prikaz.
 * Pravila usklađivanja su u lib/sync.ts (pod testom); ovdje je samo „kada" i „kako se vidi".
 * Greška se nikad ne guta: završi u `info.error` i prikazuje se na ekranu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookletLang } from './lib/booklet';
import { dbGet, dbSet } from './lib/db';
import { applyChanges, emptyMeta, hasLocalChanges, snapshotOf, syncOnce, toRecords, type Meta, type StudioState } from './lib/sync';

export type CloudStatus = 'off' | 'loading' | 'signedout' | 'syncing' | 'ok' | 'offline' | 'denied' | 'error';
export interface CloudInfo {
  status: CloudStatus;
  email: string;
  lastAt: number | null;
  error: string;
  tooBig: number;
  /** Zadnji krug: koliko je zapisa povučeno / poslano. */
  pulled: number;
  pushed: number;
}

const POLL_MS = 4 * 60_000; // povlačenje dok je prozor otvoren
const DEBOUNCE_MS = 4_000; // slanje nakon stanke u uređivanju

type Cloud = typeof import('./lib/cloud');

const errorText = (e: unknown): { code: string; text: string } => {
  const code = String((e as { code?: string })?.code ?? '');
  const text = String((e as Error)?.message || e).slice(0, 200);
  return { code, text };
};

export function useCloudSync(opts: { ready: boolean; state: StudioState; setState: (s: StudioState) => void; persist: (s: StudioState) => Promise<void>; lang: BookletLang }) {
  const { ready, state, setState, persist, lang } = opts;
  const [info, setInfo] = useState<CloudInfo>({ status: 'off', email: '', lastAt: null, error: '', tooBig: 0, pulled: 0, pushed: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const langRef = useRef(lang);
  langRef.current = lang;
  const cb = useRef({ setState, persist });
  cb.current = { setState, persist };
  const cloud = useRef<Cloud | null>(null);
  const user = useRef<{ uid: string; email: string } | null>(null);
  const unwatch = useRef<(() => void) | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | null>(null);

  const patch = (p: Partial<CloudInfo>) => setInfo((cur) => ({ ...cur, ...p }));

  const run = useCallback(async () => {
    const c = cloud.current;
    const u = user.current;
    if (!c || !u) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    patch({ status: 'syncing', error: '' });
    try {
      let meta = (await dbGet<Meta>('syncmeta')) ?? emptyMeta(u.uid);
      if (meta.uid !== u.uid) meta = emptyMeta(u.uid); // drugi račun: ništa nije usklađeno
      const local = toRecords(stateRef.current);
      const snap = snapshotOf(local);
      const r = await syncOnce(local, meta, c.remote);
      const next = applyChanges(stateRef.current, r.changes, snap, langRef.current);
      if (next !== stateRef.current) {
        // prvo na uređaj, tek onda u evidenciju: inače bi pad usred kruga ostavio „usklađeno" uz staro stanje, a sljedeći krug bi staro poslao preko novog
        await cb.current.persist(next);
        stateRef.current = next;
        cb.current.setState(next);
      }
      await dbSet('syncmeta', r.meta);
      patch({ status: r.pushError ? 'error' : 'ok', error: r.pushError ? r.pushError.slice(0, 200) : '', lastAt: Date.now(), tooBig: r.tooBig.length, pulled: r.pulled, pushed: r.pushed });
    } catch (e) {
      const { code, text } = errorText(e);
      if (code === 'permission-denied') patch({ status: 'denied', error: text });
      else if (typeof navigator !== 'undefined' && navigator.onLine === false) patch({ status: 'offline', error: '' });
      else patch({ status: 'error', error: text });
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        window.setTimeout(() => void run(), 500);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (cloud.current) return;
    patch({ status: 'loading', error: '' });
    try {
      const c = await import('./lib/cloud');
      cloud.current = c;
      unwatch.current = c.watchUser((u) => {
        user.current = u;
        if (u) {
          patch({ email: u.email });
          void run();
        } else patch({ status: 'signedout', email: '' });
      });
    } catch (e) {
      patch({ status: 'error', error: errorText(e).text });
    }
  }, [run]);

  // Prijašnja prijava: ako je korisnik jednom uključio sinkronizaciju, nastavlja se sama
  useEffect(() => {
    if (!ready) return;
    void dbGet<boolean>('cloudOn').then((on) => {
      if (on) void connect();
    });
    return () => unwatch.current?.();
  }, [ready, connect]);

  const signIn = useCallback(async () => {
    patch({ error: '' });
    try {
      await connect();
      // connect() vraća kad je modul učitan; prijava ide kroz isti modul
      await cloud.current?.signIn();
      await dbSet('cloudOn', true);
    } catch (e) {
      const { code, text } = errorText(e);
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') patch({ status: 'signedout', error: '' });
      else patch({ status: 'error', error: code === 'auth/popup-blocked' ? 'popup-blocked' : code === 'auth/unauthorized-domain' ? 'unauthorized-domain' : code === 'auth/internal-error' || code === 'auth/network-request-failed' ? 'network' : text });
    }
  }, [connect]);

  const signOut = useCallback(async () => {
    try {
      await cloud.current?.signOut();
      await dbSet('cloudOn', false);
      patch({ status: 'signedout', email: '', error: '' });
    } catch (e) {
      patch({ status: 'error', error: errorText(e).text });
    }
  }, []);

  // Izmjene: pošalji nakon stanke, ali samo ako ima što poslati (provjera je lokalna, bez mreže)
  useEffect(() => {
    if (!ready || !user.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void (async () => {
        const meta = (await dbGet<Meta>('syncmeta')) ?? emptyMeta(user.current?.uid ?? '');
        if (meta.uid !== user.current?.uid || hasLocalChanges(toRecords(stateRef.current), meta)) void run();
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [ready, state, run]);

  // Povlačenje tuđih izmjena: povremeno, kad se prozor vrati u prvi plan i kad se vrati mreža
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      if (document.visibilityState === 'visible' && user.current) void run();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [ready, run]);

  return { info, signIn, signOut, syncNow: run };
}
