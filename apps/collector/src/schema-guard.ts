// #81: the collector image and the database schema ship on separate paths, so an
// image can start against a database that is missing a migration it needs. The
// normalized writes then fail while the Clash attempts still record healthy, which
// looks like a working collector that is recording nothing.
//
// The image carries the migration versions present when it was built; the database
// reports what it has applied. Anything in the first list and not the second is a
// migration this image needs and the database does not have.

export interface SchemaState {
  /** Versions this image needs that the database has not applied, oldest first. */
  missing: string[];
  /** False when the guard could not establish the answer; never treated as behind. */
  known: boolean;
}

export function missingMigrations(
  required: readonly string[],
  applied: readonly string[],
): string[] {
  const present = new Set(applied);
  return required.filter((version) => !present.has(version)).sort();
}

export interface SchemaGuardDependencies {
  /** The versions baked into this image, or null when the manifest is absent. */
  manifest: () => Promise<readonly string[] | null>;
  /** The versions the database reports applied. */
  applied: () => Promise<readonly string[]>;
  onUnknown?: (reason: string) => void;
}

export async function evaluateSchema(
  dependencies: SchemaGuardDependencies,
): Promise<SchemaState> {
  let required: readonly string[] | null;
  try {
    required = await dependencies.manifest();
  } catch (error) {
    dependencies.onUnknown?.(`could not read the image migration manifest: ${message(error)}`);
    return { missing: [], known: false };
  }
  if (required === null) {
    dependencies.onUnknown?.("this image carries no migration manifest");
    return { missing: [], known: false };
  }

  let applied: readonly string[];
  try {
    applied = await dependencies.applied();
  } catch (error) {
    // Deliberately not fail-closed. A schema that is behind stays behind, so the next
    // run catches it; a transient RPC failure that silently stopped normalization would
    // be a new quiet failure of exactly the kind this guard exists to remove. When the
    // database is genuinely unreachable the run's own writes fail loudly anyway.
    dependencies.onUnknown?.(`could not read the applied migration ledger: ${message(error)}`);
    return { missing: [], known: false };
  }

  return { missing: missingMigrations(required, applied), known: true };
}

export function parseMigrationManifest(contents: string): string[] {
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw new Error("migration manifest is not an array of version strings");
  }
  return [...parsed as string[]].sort();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
