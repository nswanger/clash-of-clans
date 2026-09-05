import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccessAuditEvent, AccessAuditPage, AccessManagementSnapshot, CollectionHealth } from "../data/operations.js";
import { AdminPage } from "./admin-page.js";

/* Fixed so the relative day and the year rule are deterministic. Local time,
   like the formats themselves. */
const now = new Date(2026, 8, 5, 12, 0);
const local = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m, d, h, min).toISOString();

const snapshot: AccessManagementSnapshot = {
  people: [
    { id: "admin-self", name: "Nick", role: "admin", isOperator: true, isCurrentUser: true },
    { id: "admin-two", name: "Ada", role: "admin", isOperator: false, isCurrentUser: false },
    { id: "leader-one", name: "Grace", role: "leader", isOperator: false, isCurrentUser: false },
  ],
  invitations: [
    {
      id: "invite-pending",
      status: "pending",
      createdAt: local(2026, 8, 4, 21, 10),
      expiresAt: local(2026, 8, 11, 21, 10),
      createdByName: "Nick",
      usedAt: null,
      usedByName: null,
      revokedAt: null,
      revokedByName: null,
      reissuedFromId: null,
      reissuedInvitationId: null,
    },
    {
      id: "invite-used",
      status: "redeemed",
      createdAt: "2026-07-18T12:00:00Z",
      expiresAt: "2026-07-19T12:00:00Z",
      createdByName: "Nick",
      usedAt: "2026-07-18T13:00:00Z",
      usedByName: "Grace",
      revokedAt: null,
      revokedByName: null,
      reissuedFromId: null,
      reissuedInvitationId: null,
    },
  ],
  auditEvents: [],
};

function auditEvent(index: number): AccessAuditEvent {
  return {
    id: `event-${index}`,
    eventType: index % 2 === 0 ? "role_granted" : "invitation_created",
    actorName: "Nick",
    targetName: index % 2 === 0 ? "Grace" : null,
    eventData: index % 2 === 0 ? { role: "leader" } : {},
    occurredAt: local(2026, 8, 4, 21, 10 - index),
  };
}

const auditPage: AccessAuditPage = { offset: 0, total: 31, events: Array.from({ length: 10 }, (_, index) => auditEvent(index)) };

const healthyCollection: CollectionHealth = {
  runId: "run-healthy",
  status: "healthy",
  startedAt: local(2026, 8, 5, 6, 0),
  finishedAt: local(2026, 8, 5, 6, 1),
  lastFreshAt: local(2026, 8, 5, 6, 1),
  errorMessage: null,
  nextRunAt: local(2026, 8, 6, 6, 1),
  activeCwl: false,
  attempts: [
    { endpoint: "clan", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 0), finishedAt: local(2026, 8, 5, 6, 0) },
    { endpoint: "members", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 0), finishedAt: local(2026, 8, 5, 6, 0) },
    ...Array.from({ length: 49 }, (_, index) => ({ endpoint: "player", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 0), finishedAt: local(2026, 8, 5, 6, 1), id: index })),
    { endpoint: "current_war", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 1), finishedAt: local(2026, 8, 5, 6, 1) },
    { endpoint: "league_group", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 1), finishedAt: local(2026, 8, 5, 6, 1) },
    { endpoint: "league_war", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: local(2026, 8, 5, 6, 1), finishedAt: local(2026, 8, 5, 6, 1) },
  ],
};

/* The shape the collector actually writes between seasons: everything healthy
   except the league group, which the Clash API answers with a 404 because no
   league group exists until the next CWL starts. */
const idleCwlCollection: CollectionHealth = {
  runId: "run-idle-cwl",
  status: "partial",
  startedAt: "2026-08-22T16:48:14Z",
  finishedAt: "2026-08-22T16:48:52Z",
  lastFreshAt: "2026-08-22T16:48:29Z",
  errorMessage: null,
  nextRunAt: "2026-08-23T16:48:52Z",
  activeCwl: false,
  attempts: [
    { endpoint: "clan", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: "2026-08-22T16:48:15Z", finishedAt: "2026-08-22T16:48:20Z" },
    { endpoint: "members", status: "healthy", httpStatus: 200, errorCategory: null, startedAt: "2026-08-22T16:48:20Z", finishedAt: "2026-08-22T16:48:29Z" },
    { endpoint: "league_group", status: "failed", httpStatus: 404, errorCategory: "not_found", startedAt: "2026-08-22T16:48:29Z", finishedAt: "2026-08-22T16:48:30Z" },
  ],
};

function renderAccess(overrides: Partial<React.ComponentProps<typeof AdminPage>> = {}) {
  const props: React.ComponentProps<typeof AdminPage> = {
    snapshot,
    auditPage,
    collection: healthyCollection,
    isOperator: false,
    loadError: undefined,
    onRetryLoad: vi.fn().mockResolvedValue(undefined),
    onAuditPage: vi.fn(),
    onCreateInvitation: vi.fn().mockResolvedValue("https://ops.test/?invitation=secret"),
    onReissueInvitation: vi.fn().mockResolvedValue("https://ops.test/?invitation=reissued"),
    onRevokeInvitation: vi.fn().mockResolvedValue(undefined),
    onPromote: vi.fn().mockResolvedValue(undefined),
    onDemote: vi.fn().mockResolvedValue(undefined),
    onRevokeAccess: vi.fn().mockResolvedValue(undefined),
    onCopyInvitation: vi.fn().mockResolvedValue(undefined),
    confirmAction: vi.fn().mockReturnValue(true),
    now: () => now,
    ...overrides,
  };
  const { unmount } = render(<AdminPage {...props} />);
  return { ...props, unmount };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name }));
  return screen.getByRole("menu");
}

describe("AdminPage", () => {
  it("shows people with their roles, and no stored links", () => {
    renderAccess();
    expect(screen.getByRole("heading", { name: /^People/ })).toHaveTextContent("People 3");
    expect(screen.getByText("Current account")).toBeVisible();
    expect(screen.getByText("operator")).toBeVisible();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });

  it("creates and copies a one-time invitation link", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText("https://ops.test/?invitation=secret")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(props.onCopyInvitation).toHaveBeenCalledWith("https://ops.test/?invitation=secret");
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation link copied");
  });

  /* #117: a pending invitation is a People row — the only invitation state with
     an action — and a redeemed one is a log entry, not a row. */
  it("lists a pending invitation as a People row with its actions behind the row menu, and not a redeemed one", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    expect(screen.getByText("Invited, not yet signed in")).toBeVisible();
    expect(screen.getByText(/Invited by Nick 4 Sep, 21:10/)).toBeVisible();
    expect(screen.getByText(/Expires 11 Sep, 21:10/)).toBeVisible();
    expect(screen.queryByText(/Redeemed by Grace/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Invitation history/ })).not.toBeInTheDocument();

    const menu = await openMenu(user, "Actions for pending invitation");
    await user.click(within(menu).getByRole("menuitem", { name: "Reissue invitation" }));
    expect(props.confirmAction).toHaveBeenCalledWith(expect.stringContaining("current link will stop working"));
    expect(props.onReissueInvitation).toHaveBeenCalledWith("invite-pending");
    expect(await screen.findByText("https://ops.test/?invitation=reissued")).toBeVisible();
  });

  it("does not mutate access when confirmation is declined", async () => {
    const user = userEvent.setup();
    const props = renderAccess({ confirmAction: vi.fn().mockReturnValue(false) });
    let menu = await openMenu(user, "Actions for Ada");
    await user.click(within(menu).getByRole("menuitem", { name: "Demote to leader" }));
    menu = await openMenu(user, "Actions for Grace");
    await user.click(within(menu).getByRole("menuitem", { name: "Revoke access" }));
    expect(props.onDemote).not.toHaveBeenCalled();
    expect(props.onRevokeAccess).not.toHaveBeenCalled();
  });

  it("hides self-lockout actions and supports promotion from the row menu", async () => {
    const user = userEvent.setup();
    const props = renderAccess();
    /* Not a class query: #25's proof rule is that no test in this suite asserts
       on a class name. The self row is the one with no menu control at all. */
    expect(screen.queryByRole("button", { name: "Actions for Nick" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Actions for/ })).toHaveLength(3);
    const menu = await openMenu(user, "Actions for Grace");
    await user.click(within(menu).getByRole("menuitem", { name: "Promote to admin" }));
    expect(props.onPromote).toHaveBeenCalledWith("leader-one");
    expect(await screen.findByRole("status")).toHaveTextContent("Grace is now an admin");
  });

  /* #117: exception-only reporting, applied to the section. */
  it("renders no health section for a healthy or running run", () => {
    const { unmount } = renderAccess();
    expect(screen.queryByRole("heading", { name: "Collection health" })).not.toBeInTheDocument();
    expect(screen.queryByText(/last observed fresh/)).not.toBeInTheDocument();
    unmount();
    renderAccess({ collection: { ...healthyCollection, status: "running", finishedAt: null, nextRunAt: null } });
    expect(screen.queryByRole("heading", { name: "Collection health" })).not.toBeInTheDocument();
  });

  it("says nothing about an idle CWL run", () => {
    renderAccess({ collection: idleCwlCollection });
    expect(screen.queryByRole("heading", { name: "Collection health" })).not.toBeInTheDocument();
    expect(screen.queryByText(/The latest collection run was not healthy/)).not.toBeInTheDocument();
  });

  it("marks a run that failed an endpoint other than the absent league group, dating the notice from the last fresh instant", () => {
    renderAccess({
      collection: {
        ...idleCwlCollection,
        lastFreshAt: local(2026, 8, 4, 14, 2),
        attempts: [
          ...idleCwlCollection.attempts,
          { endpoint: "player", status: "failed", httpStatus: 200, errorCategory: "normalization_error", startedAt: "2026-08-22T16:48:31Z", finishedAt: "2026-08-22T16:48:33Z" },
        ],
      },
    });
    expect(screen.getByRole("heading", { name: "Collection health" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("The latest collection run was not healthy");
    expect(screen.getByRole("alert")).toHaveTextContent("last fresh observation, 4 Sep, 14:02.");
    expect(screen.getByText("player")).toBeVisible();
    expect(screen.getByText("normalization_error")).toBeVisible();
  });

  /* #74: the empty health is what `loadCollectionHealth` returns when the table
     has no rows, and naming a run in that state sent the reader looking for one
     that does not exist. It is still a fault, stated as the fault it is. */
  it("names the absence rather than a run when no collection run exists", () => {
    renderAccess({
      collection: { runId: null, status: null, startedAt: null, finishedAt: null, lastFreshAt: null, errorMessage: null, nextRunAt: null, activeCwl: null, attempts: [] },
    });
    expect(screen.getByText("No collection run has been recorded")).toBeVisible();
    expect(screen.queryByText(/The latest collection run was not healthy/)).not.toBeInTheDocument();
  });

  it("shows a recoverable row error after a failed mutation", async () => {
    const user = userEvent.setup();
    const onRevokeInvitation = vi.fn().mockRejectedValue(new Error("Invitation is no longer pending"));
    const props = renderAccess({ onRevokeInvitation });
    const menu = await openMenu(user, "Actions for pending invitation");
    await user.click(within(menu).getByRole("menuitem", { name: "Revoke invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invitation is no longer pending");
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(props.onRetryLoad).toHaveBeenCalled();
  });

  describe("the Collector section (#117)", () => {
    it("renders for an operator and not for an admin", () => {
      const { unmount } = renderAccess();
      expect(screen.queryByRole("heading", { name: "Collector" })).not.toBeInTheDocument();
      unmount();
      renderAccess({ isOperator: true });
      expect(screen.getByRole("heading", { name: "Collector" })).toBeVisible();
    });

    it("always draws six endpoint rows, with the player result as the one figure and no times on rows", () => {
      renderAccess({ isOperator: true });
      const section = screen.getByRole("heading", { name: "Collector" }).closest("section")!;
      for (const endpoint of ["clan", "members", "player", "current_war", "league_group", "league_war"]) {
        expect(within(section).getByText(endpoint)).toBeVisible();
      }
      expect(within(section).getAllByText("healthy")).toHaveLength(7);
      expect(within(section).getByText("49 of 49 profiles")).toBeVisible();
      expect(within(section).getByText("Last run").closest("p")).toHaveTextContent("Last run 5 Sep, 06:00 – 06:01 · every 24 h while idle");
      expect(within(section).getByText(/Next run/)).toHaveTextContent("Next run tomorrow, 06:01");
      /* The run line dates every attempt; no row repeats a clock. */
      expect(within(section).queryAllByRole("time")).toHaveLength(0);
    });

    it("aggregates repeated endpoints to the worst state with a count, marks missing attempts, and locates the fault without a second notice", () => {
      renderAccess({
        isOperator: true,
        collection: {
          ...healthyCollection,
          status: "partial",
          lastFreshAt: local(2026, 8, 4, 14, 2),
          attempts: [
            ...healthyCollection.attempts.filter((attempt) => attempt.endpoint !== "league_war").map((attempt, index) =>
              attempt.endpoint === "player" && index < 5
                ? { ...attempt, status: "failed", httpStatus: 503, errorCategory: "upstream_unavailable" }
                : attempt),
          ],
        },
      });
      const section = screen.getByRole("heading", { name: "Collector" }).closest("section")!;
      expect(within(section).getByText("3 failed")).toBeVisible();
      expect(within(section).getByText("46 of 49 profiles")).toBeVisible();
      expect(within(section).getByText("upstream_unavailable")).toBeVisible();
      expect(within(section).getByText("no attempt")).toBeVisible();
      expect(within(section).getByText("partial")).toBeVisible();
      expect(within(section).getByText("Last run").closest("p")).toHaveTextContent("data last fresh 4 Sep, 14:02");
      expect(within(section).queryByRole("alert")).not.toBeInTheDocument();
      /* The fault is announced once, above. */
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it("reads a crashed run as not scheduled and a running one as still running", () => {
      const { unmount } = renderAccess({ isOperator: true, collection: { ...healthyCollection, status: "error", nextRunAt: null } });
      expect(screen.getByText("Next run not scheduled")).toBeVisible();
      unmount();
      renderAccess({ isOperator: true, collection: { ...healthyCollection, status: "running", finishedAt: null, nextRunAt: null } });
      expect(screen.queryByText(/Next run/)).not.toBeInTheDocument();
      expect(screen.getByText("Last run").closest("p")).toHaveTextContent("still running");
    });
  });

  describe("the access log (#117, ADR 0024)", () => {
    it("is closed on load with the total on its head, opens from the head, and pages at ten", async () => {
      const user = userEvent.setup();
      const props = renderAccess();
      const heading = screen.getByRole("heading", { name: /^Access activity/ });
      expect(heading).toHaveTextContent("Access activity 31");
      const details = heading.closest("details")!;
      expect(details.open).toBe(false);

      await user.click(heading);
      expect(details.open).toBe(true);
      expect(screen.getAllByRole("listitem")).toHaveLength(10);
      expect(screen.getByText("1–10 of 31")).toBeVisible();
      expect(screen.getAllByText("Nick granted leader access to Grace")).toHaveLength(5);
      expect(screen.getAllByRole("time")[0]).toHaveTextContent("4 Sep 21:10");
      expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Older" }));
      expect(props.onAuditPage).toHaveBeenCalledWith(10);
    });

    it("disables Older on the last page", () => {
      renderAccess({ auditPage: { offset: 30, total: 31, events: [auditEvent(30)] } });
      expect(screen.getByText("31–31 of 31")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Newer" })).toBeEnabled();
    });
  });
});
