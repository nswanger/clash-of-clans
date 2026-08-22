import { describe, expect, it } from "vitest";

/* The Node 25 Web Storage global answered none of the Storage methods and
   shadowed jsdom's, which broke every suite that touched `localStorage`. The
   repair lives in `setup.ts`; without a test of its own it would be invisible
   until some future suite reached for storage and failed for reasons nobody
   would connect to a Node upgrade. */
describe("the test environment's Web Storage", () => {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    it(`gives ${name} the whole Storage interface`, () => {
      const storage = globalThis[name];
      for (const method of ["getItem", "setItem", "removeItem", "clear", "key"] as const) {
        expect(typeof storage[method], `${name}.${method}`).toBe("function");
      }

      storage.setItem("season", "2026-08");
      expect(storage.getItem("season")).toBe("2026-08");
      expect(storage.length).toBe(1);
      expect(storage.key(0)).toBe("season");

      storage.removeItem("season");
      expect(storage.getItem("season")).toBeNull();
      expect(storage.length).toBe(0);
    });
  }

  it("reaches the same storage through window as through globalThis", () => {
    expect(window.localStorage).toBe(globalThis.localStorage);
  });
});
