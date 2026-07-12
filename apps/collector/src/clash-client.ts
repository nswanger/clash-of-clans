export type ClashErrorCode =
  | "invalid_ip"
  | "rate_limited"
  | "not_found"
  | "unauthorized"
  | "timeout"
  | "network"
  | "api_error"
  | "invalid_response"
  | "incomplete_response";

export class ClashApiError extends Error {
  constructor(
    public readonly code: ClashErrorCode,
    message: string,
    public readonly httpStatus?: number,
    public readonly retryAfterSeconds?: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "ClashApiError";
  }
}

export interface ClashMember {
  tag: string;
  name: string;
  townHallLevel: number;
  [key: string]: unknown;
}

export interface ClashClan {
  tag: string;
  name: string;
  memberList: ClashMember[];
  [key: string]: unknown;
}

export interface ClashMemberList {
  items: ClashMember[];
  [key: string]: unknown;
}

export interface ClashPlayer extends ClashMember {}

export interface ClashLeagueGroup {
  state: string;
  season: string;
  clans: unknown[];
  rounds: Array<{ warTags: string[]; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface ClashLeagueWar {
  tag: string;
  state: string;
  clan: Record<string, unknown>;
  opponent: Record<string, unknown>;
  [key: string]: unknown;
}

interface Logger {
  error(message: string): void;
}

export interface ClashClientOptions {
  token: string;
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
  timeoutMs?: number;
  logger?: Logger;
}

type Validator<T> = (value: unknown) => value is T;

export class ClashClient {
  private readonly fetch: typeof globalThis.fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly logger: Logger;

  constructor(private readonly options: ClashClientOptions) {
    if (!options.token.trim()) throw new Error("Clash API token is required");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.baseUrl = (options.baseUrl ?? "https://api.clashofclans.com/v1").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.logger = options.logger ?? console;
  }

  getClan(tag: string, signal?: AbortSignal): Promise<ClashClan> {
    return this.request(`/clans/${encodeURIComponent(tag)}`, isClan, false, signal);
  }

  getMembers(tag: string, signal?: AbortSignal): Promise<ClashMemberList> {
    return this.request(`/clans/${encodeURIComponent(tag)}/members`, isMemberList, false, signal);
  }

  getPlayer(tag: string, signal?: AbortSignal): Promise<ClashPlayer> {
    return this.request(`/players/${encodeURIComponent(tag)}`, isMember, false, signal);
  }

  getLeagueGroup(tag: string, signal?: AbortSignal): Promise<ClashLeagueGroup> {
    return this.request(`/clans/${encodeURIComponent(tag)}/currentwar/leaguegroup`, isLeagueGroup, true, signal);
  }

  getLeagueWar(tag: string, signal?: AbortSignal): Promise<ClashLeagueWar> {
    return this.request(`/clanwarleagues/wars/${encodeURIComponent(tag)}`, isLeagueWar, false, signal);
  }

  private async request<T>(
    path: string,
    validator: Validator<T>,
    cwlResponse = false,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Clash request timed out")), this.timeoutMs);
    const abortFromParent = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abortFromParent, { once: true });
    if (signal?.aborted) abortFromParent();
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { authorization: `Bearer ${this.options.token}` },
        signal: controller.signal,
      });
    } catch (error) {
      const code = controller.signal.aborted ? "timeout" : "network";
      this.logger.error(`Clash request failed (${code}) for ${path}`);
      throw new ClashApiError(code, `Clash request failed: ${code}`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromParent);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      this.logger.error(`Clash response was not JSON (${response.status}) for ${path}`);
      throw new ClashApiError("invalid_response", "Clash response was not valid JSON", response.status);
    }

    if (!response.ok) throw this.mapHttpError(response, body, path);
    if (!validator(body)) {
      const code = cwlResponse ? "incomplete_response" : "invalid_response";
      this.logger.error(`Clash response validation failed (${response.status}) for ${path}`);
      throw new ClashApiError(
        code,
        "Clash response did not match the expected shape",
        response.status,
        undefined,
        body,
      );
    }
    return body;
  }

  private mapHttpError(response: Response, body: unknown, path: string): ClashApiError {
    const reason = isRecord(body) && typeof body.reason === "string" ? body.reason : "unknown";
    let code: ClashErrorCode = "api_error";
    if (response.status === 403 && reason === "accessDenied.invalidIp") code = "invalid_ip";
    else if (response.status === 429) code = "rate_limited";
    else if (response.status === 404) code = "not_found";
    else if (response.status === 401 || response.status === 403) code = "unauthorized";
    const retryHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryHeader === null ? undefined : Number.parseInt(retryHeader, 10);
    this.logger.error(`Clash API error (${response.status}, ${code}) for ${path}`);
    return new ClashApiError(
      code,
      `Clash API request failed: ${code}`,
      response.status,
      Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      body,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMember(value: unknown): value is ClashMember {
  return isRecord(value)
    && typeof value.tag === "string"
    && typeof value.name === "string"
    && typeof value.townHallLevel === "number";
}

function isMemberList(value: unknown): value is ClashMemberList {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isMember);
}

function isClan(value: unknown): value is ClashClan {
  return isRecord(value)
    && typeof value.tag === "string"
    && typeof value.name === "string"
    && Array.isArray(value.memberList)
    && value.memberList.every(isMember);
}

function isLeagueGroup(value: unknown): value is ClashLeagueGroup {
  return isRecord(value)
    && typeof value.state === "string"
    && typeof value.season === "string"
    && Array.isArray(value.clans)
    && Array.isArray(value.rounds)
    && value.rounds.every((round) => isRecord(round)
      && Array.isArray(round.warTags)
      && round.warTags.every((tag) => typeof tag === "string"));
}

function isLeagueWar(value: unknown): value is ClashLeagueWar {
  return isRecord(value)
    && typeof value.tag === "string"
    && typeof value.state === "string"
    && isRecord(value.clan)
    && isRecord(value.opponent);
}
