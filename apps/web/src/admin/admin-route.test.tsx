import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AccessManagementSnapshot } from "../data/operations.js";
import { AdminRoute } from "./admin-route.js";

const snapshot: AccessManagementSnapshot = {
  people: [{ id: "admin-self", name: "Nick", role: "admin", isOperator: true, isCurrentUser: true }],
  invitations: [],
  auditEvents: [],
};

/* The route reads three tables beside the snapshot RPC (#117): the audit log
   page, the target names for it, and collection health. A chainable stub that
   resolves to whatever the table holds is enough — the query shape is asserted
   where it matters, in `operations.test.ts`. */
function tableClient(tables: Record<string, { data: unknown; count?: number }>) {
  return (table: string) => {
    const result = tables[table] ?? { data: [] };
    const query: any = {
      then: (resolve: (value: unknown) => void) => resolve({ ...result, error: null }),
      maybeSingle: async () => ({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null }),
    };
    for (const method of ["select", "in", "eq", "order", "range", "limit"]) query[method] = () => query;
    return query;
  };
}

const auditRows = Array.from({ length: 12 }, (_, index) => ({
  id: `event-${index}`, event_type: "invitation_created", actor_id: "admin-self", entity_type: "invitation",
  event_data: {}, occurred_at: new Date(Date.UTC(2026, 8, 4, 21, 10 - index)).toISOString(), actor: { display_name: "Nick" },
}));

function clientFor(rpc: ReturnType<typeof vi.fn>) {
  return {
    rpc,
    from: tableClient({
      audit_events: { data: auditRows.slice(0, 10), count: auditRows.length },
      collection_runs: { data: [] },
    }),
  };
}

describe("AdminRoute", () => {
  it("loads the protected snapshot and refreshes after creating an invitation", async () => {
    const user = userEvent.setup();
    const rpc = vi.fn().mockImplementation((name: string) => Promise.resolve({
      data: name === "create_invitation" ? "one-time-token" : snapshot,
      error: null,
    }));

    render(<AdminRoute client={clientFor(rpc)} origin="https://ops.test/clash-of-clans/" isOperator={false} />);

    expect(await screen.findByText("Nick")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Create invitation" }));
    expect(await screen.findByText("https://ops.test/clash-of-clans/?invitation=one-time-token")).toBeVisible();
    expect(rpc).toHaveBeenCalledWith("create_invitation", expect.objectContaining({ invitation_expires_at: expect.any(String) }));
    expect(rpc.mock.calls.filter(([name]) => name === "get_access_management_snapshot")).toHaveLength(2);
  });

  it("shows an initial load error and retries without leaving the route", async () => {
    const user = userEvent.setup();
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "Temporary failure" } })
      .mockResolvedValueOnce({ data: snapshot, error: null });

    render(<AdminRoute client={clientFor(rpc)} origin="https://ops.test/" isOperator={false} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Temporary failure");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Nick")).toBeVisible());
  });

  /* The count travels with the first page, so a closed log still says how much
     is behind it, and the board is the operator's alone. */
  it("carries the access-log total on the closed head and shows the board only to an operator", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null });
    const { unmount } = render(<AdminRoute client={clientFor(rpc)} origin="https://ops.test/" isOperator={false} />);
    expect(await screen.findByRole("heading", { name: /^Access activity/ })).toHaveTextContent("Access activity 12");
    expect(screen.queryByRole("heading", { name: "Collector" })).not.toBeInTheDocument();
    unmount();

    render(<AdminRoute client={clientFor(rpc)} origin="https://ops.test/" isOperator={true} />);
    expect(await screen.findByRole("heading", { name: "Collector" })).toBeVisible();
  });
});
