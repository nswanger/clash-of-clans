import { useEffect, useState, type FormEvent } from "react";
import { DailyDashboard, type DailyDashboardData } from "./daily-dashboard.js";

interface DashboardPageProps {
  load: () => Promise<DailyDashboardData>;
  onApprove?: (recommendationId: string, changes: NonNullable<DailyDashboardData["finalChanges"]>) => Promise<void>;
  onOverride?: (recommendationId: string, changes: NonNullable<DailyDashboardData["finalChanges"]>, note: string) => Promise<void>;
}

export function DashboardPage({ load, onApprove, onOverride }: DashboardPageProps) {
  const [data, setData] = useState<DailyDashboardData>();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [includedChanges, setIncludedChanges] = useState<number[]>([]);
  const [decisionMessage, setDecisionMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    void load().then(
      (result) => { if (active) setData(result); },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load dashboard data."); },
    );
    return () => { active = false; };
  }, [load]);

  if (error) return <main className="dashboard-shell"><div className="dashboard-warning" role="alert">{error}</div></main>;
  if (!data) return <main className="dashboard-shell"><p role="status">Loading daily operations…</p></main>;
  const changes = data.finalChanges ?? [];
  const approve = () => {
    if (data.recommendationId && onApprove) void onApprove(data.recommendationId, changes).then(() => setDecisionMessage("Changes approved and recorded.")).catch((reason) => setError(reason.message));
  };
  const beginEdit = () => { setIncludedChanges(changes.map((_, index) => index)); setEditing(true); };
  const saveOverride = (event: FormEvent) => {
    event.preventDefault();
    if (data.recommendationId && onOverride) void onOverride(data.recommendationId, changes.filter((_, index) => includedChanges.includes(index)), overrideNote.trim()).then(() => { setEditing(false); setDecisionMessage("Override recorded."); }).catch((reason) => setError(reason.message));
  };
  return <>
    <DailyDashboard data={data} onApprove={approve} onEdit={beginEdit} actionsDisabled={Boolean(decisionMessage)} />
    {decisionMessage ? <p className="dashboard-shell" role="status">{decisionMessage}</p> : null}
    {editing ? <form className="dashboard-shell" onSubmit={saveOverride}>
      <h2>Edit lineup</h2>
      {changes.map((change, index) => <label key={`${change.outPlayerTag}:${change.inPlayerTag}`}>
        <input type="checkbox" checked={includedChanges.includes(index)} onChange={() => setIncludedChanges((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index])} />
        Include {change.outPlayerTag} → {change.inPlayerTag}
      </label>)}
      <label>Override note<textarea aria-label="Override note" required value={overrideNote} onChange={(event) => setOverrideNote(event.target.value)} /></label>
      <button className="primary-button" type="submit">Save override</button>
    </form> : null}
  </>;
}
