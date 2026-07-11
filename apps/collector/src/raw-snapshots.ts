export type CollectionStatus = "running" | "healthy" | "partial" | "invalid_ip" | "error";

export interface CreateAttemptInput {
  runId: string;
  endpoint: string;
  requestIdentity: string;
  startedAt: string;
}

export interface SaveSnapshotInput {
  collectionAttemptId: string;
  endpoint: string;
  requestIdentity: string;
  collectedAt: string;
  httpStatus: number;
  contentSha256: string;
  responseBody: unknown;
}

export interface FinishAttemptInput {
  attemptId: string;
  status: CollectionStatus;
  httpStatus?: number;
  finishedAt: string;
  errorCategory?: string;
}

export interface FinishRunInput {
  runId: string;
  status: CollectionStatus;
  finishedAt: string;
  lastFreshAt: string | null;
  errorMessage?: string;
}

export interface RawSnapshotStore {
  createRun(input: { startedAt: string }): Promise<string>;
  createAttempt(input: CreateAttemptInput): Promise<string>;
  saveSnapshot(input: SaveSnapshotInput): Promise<void>;
  finishAttempt(input: FinishAttemptInput): Promise<void>;
  finishRun(input: FinishRunInput): Promise<void>;
}

export async function fingerprintJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
