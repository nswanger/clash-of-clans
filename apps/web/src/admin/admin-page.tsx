/* The Admin route (`#/admin`), conformed to Clan Muster (#25, wave 3), with the
 * collector status board and operator gate of #117.
 *
 * `#/access` widened rather than being deleted (ADR 0002). It gains collection
 * health, which is where "is this data trustworthy" belongs beside "who can see
 * it" — and which is what closes #9, whose whole complaint is that
 * normalization errors are recorded and never surfaced.
 *
 * Four sections after #117, in this order: Collection health (every admin, and
 * ONLY when a run is unhealthy) · Collector (operators only; the six-endpoint
 * board, always drawn) · People (with pending invitations as rows) · Access
 * activity (a log, closed until opened, paged at ten). Trust of the data stays
 * on top because everything below is read in its light.
 *
 * Invitation history left as a section: a pending invitation is the only state
 * with an action, and every other state is already a row in the access log.
 *
 * No explanatory prose under any section (#124): the labels, marks and counts
 * have to carry it.
 */
import { useState } from "react";
import { AppTopbar, useDismissable } from "../app-chrome.js";
import { Icon } from "../design/icon.js";
import { LIST_MAX_ROWS } from "../design/layout.js";
import {
  isCollectionUnhealthy,
  isExpectedIdleCwlPartial,
  type AccessAuditEvent,
  type AccessAuditPage,
  type AccessInvitation,
  type AccessManagementSnapshot,
  type AccessPerson,
  type CollectionAttemptHealth,
  type CollectionHealth,
} from "../data/operations.js";
import { formatInstant, formatLogTime, formatRelativeInstant, formatRunWindow } from "./admin-format.js";
import "./admin.css";

interface Props {
  snapshot: AccessManagementSnapshot;
  auditPage: AccessAuditPage | undefined;
  collection: CollectionHealth | undefined;
  isOperator: boolean;
  loadError: string | undefined;
  onRetryLoad(): Promise<void>;
  onAuditPage(offset: number): void;
  onCreateInvitation(): Promise<string>;
  onReissueInvitation(id: string): Promise<string>;
  onRevokeInvitation(id: string): Promise<void>;
  onPromote(id: string): Promise<void>;
  onDemote(id: string): Promise<void>;
  onRevokeAccess(id: string): Promise<void>;
  onCopyInvitation(value: string): Promise<void>;
  confirmAction(message: string): boolean;
  /* Injected so the relative day and the year rule are testable; the route
     leaves it at the clock. */
  now?: () => Date;
}

interface FreshInvitation { url: string; action: "created" | "reissued" }

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : "The access change could not be completed.";
}

/* The five marks (#19), and an access role is a CATEGORY rather than an
 * evaluation — so `admin` is success only because it is the wider grant, and
 * `leader` takes no colour at all. */
function roleVariant(role: AccessPerson["role"]): string {
  return role === "admin" ? "is-success" : "";
}

function AuditDescription({ event }: { event: AccessAuditEvent }) {
  const role = typeof event.eventData.role === "string" ? event.eventData.role : "access";
  const target = event.targetName ?? "an account";
  switch (event.eventType) {
    case "invitation_created": return <>{event.actorName} created an invitation</>;
    case "invitation_reissued": return <>{event.actorName} reissued an invitation</>;
    case "invitation_revoked": return <>{event.actorName} revoked an invitation</>;
    case "invitation_redeemed": return <>{event.actorName} redeemed an invitation</>;
    case "role_granted": return <>{event.actorName} granted {role} access to {target}</>;
    case "role_revoked": return <>{event.actorName} revoked {role} access from {target}</>;
  }
}

/* Row actions behind one control (#125): a `cm-iconbutton` opening a
 * `cm-routemenu`, never inline ghosts. The menu is the account menu's shape one
 * scope down, and it dismisses the way every menu in the app does. */
interface RowMenuItem { label: string; onSelect(): void; danger?: boolean | undefined; disabled?: boolean | undefined }

function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismissable(open, () => setOpen(false));
  return <span className="admin-rowmenu" ref={ref}>
    <button
      className="cm-iconbutton is-small"
      type="button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    ><Icon name="more" /></button>
    {open
      ? <div className="cm-routemenu is-trailing" role="menu">
          {items.map((item) => <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? "is-danger" : undefined}
            disabled={item.disabled}
            onClick={() => { setOpen(false); item.onSelect(); }}
          >{item.label}</button>)}
        </div>
      : null}
  </span>;
}

/* Collection health, for every admin — and only when something is wrong.
 *
 * EXCEPTION-ONLY REPORTING, ADR 0014's row rule applied to the section (#117): a
 * healthy or running run puts nothing on the page. Silence means the data is
 * current, and the one danger notice is where that stops being true. The
 * notice's second line carries the last fresh instant, because that is the
 * number a leader needs to read everything else by and it no longer has a
 * resting place above.
 *
 * The failing attempts are what #9 asked for. `error_category` is the whole of
 * what the schema stores — the collector's own message is pushed onto
 * `internalErrors` and never persisted — so this says which endpoint failed and
 * how it was categorised, and stops there rather than inventing detail. */
function CollectionHealthSection({ collection, now }: { collection: CollectionHealth | undefined; now: Date }) {
  if (!collection || !isCollectionUnhealthy(collection)) return null;
  /* Between seasons the league group's 404 is the expected shape of a `partial`
     run, and `isCollectionUnhealthy` already cleared it; what reaches here is a
     real fault, so the breakdown lists what failed. */
  const failing = isExpectedIdleCwlPartial(collection)
    ? []
    : collection.attempts.filter((attempt) => attempt.status !== "healthy");
  return (
    <section className="cm-section admin-section" aria-labelledby="admin-collection-heading">
      <div className="cm-section-head">
        <h2 id="admin-collection-heading">Collection health</h2>
        {collection.status ? <span className="cm-pill is-danger">{collection.status}</span> : null}
      </div>
      {/* A run with no status is no run: `loadCollectionHealth` returns the
          empty health when the table has no rows, and calling that "the latest
          run was not healthy" names a run the reader could go and look at (#74).
          It stays a fault — absent evidence stays absent — but it is the fault
          it actually is. */}
      <div className="cm-notice" role="alert">
        <div className="cm-grow">
          {collection.status
            ? <>
                <strong>The latest collection run was not healthy</strong>
                <p>{collection.lastFreshAt
                  ? <>Figures elsewhere in the app are as old as the last fresh observation, {formatInstant(collection.lastFreshAt, now)}.</>
                  : <>No fresh observation has been recorded, so nothing the app shows can be dated.</>}</p>
              </>
            : <>
                <strong>No collection run has been recorded</strong>
                <p>Nothing the app shows can be dated. Check that the collector is running.</p>
              </>}
        </div>
      </div>
      {/* One line per failing ENDPOINT, not per attempt: the player endpoint
          runs once per member, and fifty identical lines say less than one line
          with a count. */}
      {failing.length
        ? <dl className="admin-facts">
            {summariseEndpoints(collection.attempts).filter((summary) => summary.failed > 0).map((summary) => <div key={summary.endpoint}>
              <dt>{summary.endpoint}</dt>
              <dd>
                <span className="cm-statustext is-unavailable">{summary.worst?.errorCategory ?? summary.worst?.status}</span>
                {summary.worst?.httpStatus === null || summary.worst?.httpStatus === undefined ? null : <> <span className="cm-sep">·</span> HTTP {summary.worst.httpStatus}</>}
                {summary.failed > 1 ? <> <span className="cm-sep">·</span> {summary.failed} of {summary.attempts} attempts</> : null}
              </dd>
            </div>)}
          </dl>
        : null}
    </section>
  );
}

/* The six endpoints in the order the collector walks them. Six rows always: the
 * board answers "did each pull happen", and a row that is absent because nothing
 * was attempted is the one answer the reader most needs to see. */
const ENDPOINTS = ["clan", "members", "player", "current_war", "league_group", "league_war"] as const;

interface EndpointSummary {
  endpoint: string;
  attempts: number;
  healthy: number;
  failed: number;
  /* The first failing attempt, when there is one — its code and category are
     what the row says beside the mark. */
  worst: CollectionAttemptHealth | undefined;
}

/* One row per endpoint from however many attempts the run made against it. The
 * player endpoint runs once per member, so its row carries the worst state and
 * a count rather than fifty rows. */
export function summariseEndpoints(attempts: CollectionAttemptHealth[]): EndpointSummary[] {
  return ENDPOINTS.map((endpoint) => {
    const own = attempts.filter((attempt) => attempt.endpoint === endpoint);
    const failing = own.filter((attempt) => attempt.status !== "healthy");
    return {
      endpoint,
      attempts: own.length,
      healthy: own.length - failing.length,
      failed: failing.length,
      worst: failing[0],
    };
  });
}

function EndpointRow({ summary }: { summary: EndpointSummary }) {
  const mark = summary.attempts === 0
    ? <span className="cm-pill">no attempt</span>
    : summary.failed === 0
      ? <span className="cm-pill is-success">healthy</span>
      : <span className="cm-pill is-danger">{summary.attempts > 1 && summary.failed < summary.attempts ? `${summary.failed} failed` : "failed"}</span>;
  return <div className="cm-row admin-row admin-endpoint">
    <span className="cm-row-main">
      <span className="cm-row-name">{summary.endpoint}</span>
      <span className="cm-row-meta">
        {mark}
        {summary.worst?.httpStatus !== undefined && summary.worst?.httpStatus !== null
          ? <><span className="cm-sep">·</span><span>HTTP {summary.worst.httpStatus}</span></>
          : null}
        {summary.worst?.errorCategory
          ? <><span className="cm-sep">·</span><span>{summary.worst.errorCategory}</span></>
          : null}
      </span>
    </span>
    {/* The one figure on the board, and it is a result rather than an attempt
        count: the player endpoint is the only one whose "did it happen" has a
        denominator. */}
    {summary.endpoint === "player" && summary.attempts > 0
      ? <span className="cm-row-figure">{summary.healthy} of {summary.attempts} profiles</span>
      : null}
  </div>;
}

/* The Collector section, for operators only (#117).
 *
 * A BOUNDED EXCEPTION TO ADR 0014, recorded in the spec: the board draws all six
 * endpoints every time, healthy or not, because "did each pull happen" cannot be
 * answered by a table that hides its completed rows. Bounded three ways —
 * operator-only, pills on rows rather than colour blocks, and NO NOTICE. A fault
 * is announced in the health section above, one notice per screen; the board is
 * where it is located.
 *
 * Rows carry no time: the run line gives the window every attempt fell in. */
function CollectorSection({ collection, now }: { collection: CollectionHealth | undefined; now: Date }) {
  const status = collection?.status ?? null;
  const unhealthy = collection ? isCollectionUnhealthy(collection) : true;
  const running = status === "running";
  const summaries = summariseEndpoints(collection?.attempts ?? []);
  const cadence = collection?.activeCwl === true ? "every hour during CWL" : collection?.activeCwl === false ? "every 24 h while idle" : null;
  return (
    <section className="cm-section admin-section" aria-labelledby="admin-collector-heading">
      <div className="cm-section-head">
        <span className="cm-grow admin-headgroup">
          <h2 id="admin-collector-heading">Collector</h2>
          {status
            ? <span className={`cm-pill ${running ? "" : unhealthy ? "is-danger" : "is-success"}`}>{status}</span>
            : null}
        </span>
        {/* Absent while running — the next run is not known until this one
            finishes — and "not scheduled" on a finished run with no instant,
            which is the crash case. */}
        {collection?.nextRunAt
          ? <span className="admin-nextrun">Next run <strong>{formatRelativeInstant(collection.nextRunAt, now)}</strong></span>
          : collection?.startedAt && !running
            ? <span className="admin-nextrun">Next run not scheduled</span>
            : null}
      </div>
      <p className="admin-freshness">
        {collection?.startedAt
          ? <>
              <strong>Last run</strong> {formatRunWindow(collection.startedAt, collection.finishedAt, now)}
              {cadence ? <><span className="cm-sep"> · </span>{cadence}</> : null}
              {unhealthy && !running && collection.lastFreshAt
                ? <><span className="cm-sep"> · </span>data last fresh {formatInstant(collection.lastFreshAt, now)}</>
                : null}
            </>
          : <><strong>Last run</strong> none recorded</>}
      </p>
      <div className="cm-rows">
        {summaries.map((summary) => <EndpointRow key={summary.endpoint} summary={summary} />)}
      </div>
    </section>
  );
}

export function AdminPage({
  snapshot,
  auditPage,
  collection,
  isOperator,
  loadError,
  onRetryLoad,
  onAuditPage,
  onCreateInvitation,
  onReissueInvitation,
  onRevokeInvitation,
  onPromote,
  onDemote,
  onRevokeAccess,
  onCopyInvitation,
  confirmAction,
  now = () => new Date(),
}: Props) {
  const [freshInvitation, setFreshInvitation] = useState<FreshInvitation>();
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>();
  const current = now();

  const runAction = async (key: string, action: () => Promise<void>, success: string) => {
    setPendingActions((current) => ({ ...current, [key]: true }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setStatus(undefined);
    try {
      await action();
      setStatus(success);
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: actionError(error) }));
    } finally {
      setPendingActions((current) => { const next = { ...current }; delete next[key]; return next; });
    }
  };

  const createInvitation = () => runAction("invitation:create", async () => {
    setFreshInvitation({ url: await onCreateInvitation(), action: "created" });
  }, "Invitation created. Copy it now; the link is not stored.");

  const reissue = (invitation: AccessInvitation) => {
    if (!confirmAction("Reissue this invitation? The current link will stop working.")) return;
    void runAction(`invitation:${invitation.id}`, async () => {
      setFreshInvitation({ url: await onReissueInvitation(invitation.id), action: "reissued" });
    }, "Invitation reissued. Copy the replacement link now.");
  };

  const revokeInvite = (invitation: AccessInvitation) => {
    if (!confirmAction("Revoke this invitation? Its link will stop working.")) return;
    void runAction(`invitation:${invitation.id}`, () => onRevokeInvitation(invitation.id), "Invitation revoked.");
  };

  const promote = (person: AccessPerson) => {
    void runAction(`person:${person.id}`, () => onPromote(person.id), `${person.name} is now an admin.`);
  };

  const demote = (person: AccessPerson) => {
    if (!confirmAction(`Demote ${person.name} to leader?`)) return;
    void runAction(`person:${person.id}`, () => onDemote(person.id), `${person.name} is now a leader.`);
  };

  const revokePerson = (person: AccessPerson) => {
    if (!confirmAction(`Revoke all access for ${person.name}?`)) return;
    void runAction(`person:${person.id}`, () => onRevokeAccess(person.id), `Access revoked for ${person.name}.`);
  };

  const copyInvitation = () => runAction("invitation:copy", () => onCopyInvitation(freshInvitation!.url), "Invitation link copied.");

  /* Only the pending ones are people-to-be; every other state is a log row. */
  const pendingInvitations = snapshot.invitations.filter((invitation) => invitation.status === "pending");

  const auditFirst = auditPage && auditPage.events.length ? auditPage.offset + 1 : 0;
  const auditLast = auditPage ? auditPage.offset + auditPage.events.length : 0;

  return <main className="cm-shell admin-page">
    <AppTopbar route="admin" eyebrow="Operations" title="Admin" />

    {/* The one notice region, danger only (#19). A load failure means what is on
        screen is stale or partial, which is the only thing on this page that can
        be wrong rather than merely absent. */}
    {loadError
      ? <div className="cm-notice" role="alert">
          <div className="cm-grow"><strong>Access data is out of date</strong><p>{loadError}</p></div>
          <button type="button" onClick={() => void onRetryLoad()}>Retry refresh</button>
        </div>
      : null}
    {errors["invitation:create"]
      ? <div className="cm-notice" role="alert">
          <div className="cm-grow"><strong>Invitation not created</strong><p>{errors["invitation:create"]}</p></div>
        </div>
      : null}

    <CollectionHealthSection collection={collection} now={current} />

    {isOperator ? <CollectorSection collection={collection} now={current} /> : null}

    <section className="cm-section admin-section" aria-labelledby="admin-people-heading">
      <div className="cm-section-head">
        <h2 id="admin-people-heading">People <span className="cm-count">{snapshot.people.length}</span></h2>
        <button
          className="cm-button"
          type="button"
          disabled={pendingActions["invitation:create"]}
          onClick={() => void createInvitation()}
        >{pendingActions["invitation:create"] ? "Creating invitation…" : "Create invitation"}</button>
      </div>

      {/* The link is shown once and never stored, so it is not a notice and not
          a row: it is a thing to copy before it is gone. That sentence lives
          here, beside the one link it is about, and nowhere else. */}
      {freshInvitation
        ? <div className="admin-fresh" aria-label={`${freshInvitation.action} invitation`}>
            <p className="cm-panel-label">{freshInvitation.action === "created" ? "New invitation" : "Replacement invitation"}</p>
            <p className="admin-token">{freshInvitation.url}</p>
            <div className="admin-actions">
              <button className="cm-ghost" type="button" disabled={pendingActions["invitation:copy"]} onClick={() => void copyInvitation()}>Copy link</button>
              <button className="cm-ghost" type="button" onClick={() => setFreshInvitation(undefined)}>Dismiss</button>
            </div>
            <p className="admin-freshness">The link is never stored and cannot be recovered once dismissed.</p>
            {errors["invitation:copy"] ? <p className="admin-error" role="alert">{errors["invitation:copy"]}</p> : null}
          </div>
        : null}

      <div className="cm-rows">
        {snapshot.people.map((person) => {
          const key = `person:${person.id}`;
          const pending = pendingActions[key];
          const items: RowMenuItem[] = person.role === "leader"
            ? [{ label: "Promote to admin", onSelect: () => promote(person), disabled: pending }]
            : [{ label: "Demote to leader", onSelect: () => demote(person), disabled: pending }];
          items.push({ label: "Revoke access", onSelect: () => revokePerson(person), danger: true, disabled: pending });
          return <div className="cm-row admin-row" key={person.id}>
            <span className="cm-row-main">
              <span className="cm-row-name">{person.name}</span>
              <span className="cm-row-meta">
                <span className={`cm-pill ${roleVariant(person.role)}`}>{person.role}</span>
                {person.isOperator ? <span className="cm-pill">operator</span> : null}
                {person.isCurrentUser ? <><span className="cm-sep">·</span>Current account</> : null}
              </span>
              {errors[key] ? <span className="admin-error" role="alert">{errors[key]}</span> : null}
            </span>
            {/* No self-lockout: the current account's row has no menu at all. */}
            {person.isCurrentUser ? null : <RowMenu label={`Actions for ${person.name}`} items={items} />}
          </div>;
        })}
        {pendingInvitations.map((invitation) => {
          const key = `invitation:${invitation.id}`;
          const pending = pendingActions[key];
          return <div className="cm-row admin-row admin-invited" key={invitation.id}>
            <span className="cm-row-main">
              <span className="cm-row-name">Invited, not yet signed in</span>
              <span className="cm-row-meta">
                <span className="cm-pill is-caution">pending</span>
                <span className="cm-sep">·</span>Invited by {invitation.createdByName} {formatInstant(invitation.createdAt, current)}
                <span className="cm-sep">·</span>Expires {formatInstant(invitation.expiresAt, current)}
              </span>
              {errors[key]
                ? <span className="admin-error" role="alert">{errors[key]}{" "}
                    <button className="cm-ghost" type="button" onClick={() => void onRetryLoad()}>Refresh status</button>
                  </span>
                : null}
            </span>
            <RowMenu label="Actions for pending invitation" items={[
              { label: "Reissue invitation", onSelect: () => reissue(invitation), disabled: pending },
              { label: "Revoke invitation", onSelect: () => revokeInvite(invitation), danger: true, disabled: pending },
            ]} />
          </div>;
        })}
      </div>
    </section>

    {/* The whole log, newest first, closed until opened: a log is consulted when
        something is wrong, not scanned daily. Paged at LIST_MAX_ROWS — ADR
        0024's pager case, built before the log is long. */}
    <details className="cm-section admin-section admin-collapsible">
      <summary className="cm-section-head">
        <h2>Access activity <span className="cm-count">{auditPage ? auditPage.total : "—"}</span></h2>
        <span className="cm-routebutton-chev" aria-hidden="true"><Icon name="chevron" /></span>
      </summary>
      {!auditPage || auditPage.total === 0
        ? <p className="cm-empty">No access activity has been recorded.</p>
        : <>
            <ol className="admin-audit">
              {auditPage.events.map((event) => <li key={event.id}>
                <time dateTime={event.occurredAt}>{formatLogTime(event.occurredAt, current)}</time>
                <span><AuditDescription event={event} /></span>
              </li>)}
            </ol>
            <div className="admin-pager">
              <span aria-live="polite">{auditFirst}–{auditLast} of {auditPage.total}</span>
              <span className="admin-actions">
                <button className="cm-ghost" type="button" disabled={auditPage.offset === 0} onClick={() => onAuditPage(Math.max(0, auditPage.offset - LIST_MAX_ROWS))}>Newer</button>
                <button className="cm-ghost" type="button" disabled={auditLast >= auditPage.total} onClick={() => onAuditPage(auditPage.offset + LIST_MAX_ROWS)}>Older</button>
              </span>
            </div>
          </>}
    </details>

    <p className="admin-live" role="status" aria-live="polite">{status ?? ""}</p>
  </main>;
}
