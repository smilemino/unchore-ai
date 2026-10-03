"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** A value only the browser knows (feature checks). Server render and first paint get `server`, then the browser value. */
export function useClientValue<T>(get: () => T, server: T): T { return useSyncExternalStore(noop, get, () => server); }

/** A small preference kept in localStorage, shared across components on the page. */
export function useStored(key: string, def: string): [string, (v: string) => void] {
  const v = useSyncExternalStore(
    (cb) => { window.addEventListener(`uc:store:${key}`, cb); return () => window.removeEventListener(`uc:store:${key}`, cb); },
    () => { try { return localStorage.getItem(key) ?? def; } catch { return def; } },
    () => def,
  );
  return [v, (nv: string) => { try { localStorage.setItem(key, nv); } catch { /* private mode */ } window.dispatchEvent(new Event(`uc:store:${key}`)); }];
}
