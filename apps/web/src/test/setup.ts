import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/* Node 25 turned the Web Storage API on by default. Its `localStorage` global
   is installed before Vitest populates the jsdom window, so jsdom's Storage is
   skipped as already-present and the runtime's own object wins — and without a
   `--localstorage-file` that object is an empty `{}` answering none of the
   Storage methods. Symptom: `window.localStorage.clear is not a function`.
   Neither vitest 3.2.7 nor jsdom 29.1.1 corrects this.
   See https://github.com/vitest-dev/vitest/issues/8757

   The obvious fix is the `--no-webstorage` flag, but that flag only exists on
   Node 25 and later: on Node 22 or 24 the runtime rejects it outright with
   `bad option` and no test runs at all. So the repair is made here in JS, where
   it holds on every Node version — the one the repo pins today and whichever
   one replaces it. On a Node whose jsdom Storage survived intact, this leaves
   it alone. */
function installWorkingStorage(globalName: "localStorage" | "sessionStorage"): void {
  const existing = (globalThis as Record<string, unknown>)[globalName];
  if (existing && typeof (existing as Storage).clear === "function") return;

  const entries = new Map<string, string>();
  /* Enough of the Storage interface for the app and its tests. Not covered:
     jsdom's Proxy-backed index access (`localStorage.someKey`) and StorageEvent
     dispatch, neither of which this codebase uses. */
  const storage: Storage = {
    getItem: (key) => entries.get(String(key)) ?? null,
    setItem: (key, value) => { entries.set(String(key), String(value)); },
    removeItem: (key) => { entries.delete(String(key)); },
    clear: () => { entries.clear(); },
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size; },
  };

  for (const target of new Set<object>([globalThis, globalThis.window ?? globalThis])) {
    Object.defineProperty(target, globalName, {
      value: storage,
      writable: true,
      configurable: true,
    });
  }
}

installWorkingStorage("localStorage");
installWorkingStorage("sessionStorage");

afterEach(cleanup);

/* The stub above outlives a single test the way a browser's Storage does, so
   clear it between tests to keep the isolation each suite expects. */
afterEach(() => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
});
