import { describe, expect, it, vi } from "vitest";
import { evaluateSchema, missingMigrations, parseMigrationManifest } from "../src/schema-guard.js";

const baked = ["202608230002", "202608290001", "202608300001"];

describe("collector schema guard", () => {
  it("names every migration the image needs that the database has not applied", () => {
    expect(missingMigrations(baked, ["202608230002"]))
      .toEqual(["202608290001", "202608300001"]);
  });

  it("does not report a database that is ahead of the image as behind", () => {
    expect(missingMigrations(baked, [...baked, "202609010001"])).toEqual([]);
  });

  it("reports the schema as behind when the ledger is missing a baked migration", async () => {
    expect(await evaluateSchema({
      manifest: async () => baked,
      applied: async () => ["202608230002", "202608290001"],
    })).toEqual({ missing: ["202608300001"], known: true });
  });

  it("treats an image with no manifest as unknown rather than behind", async () => {
    const onUnknown = vi.fn();
    expect(await evaluateSchema({ manifest: async () => null, applied: async () => [], onUnknown }))
      .toEqual({ missing: [], known: false });
    expect(onUnknown).toHaveBeenCalledWith(expect.stringContaining("no migration manifest"));
  });

  it("does not degrade the collector when the ledger cannot be read", async () => {
    // A schema that is behind stays behind and the next run catches it. Halting
    // normalization on a transient failure would be the quiet fault this guard removes.
    const onUnknown = vi.fn();
    expect(await evaluateSchema({
      manifest: async () => baked,
      applied: async () => { throw new Error("connection reset"); },
      onUnknown,
    })).toEqual({ missing: [], known: false });
    expect(onUnknown).toHaveBeenCalledWith(expect.stringContaining("connection reset"));
  });

  it("rejects a manifest that is not a list of versions", () => {
    expect(parseMigrationManifest('["202608300001"]')).toEqual(["202608300001"]);
    expect(() => parseMigrationManifest('{"version":1}')).toThrow(/array of version strings/);
    expect(() => parseMigrationManifest("[1,2]")).toThrow(/array of version strings/);
  });
});
