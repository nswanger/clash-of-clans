import { useEffect, useState } from "react";

export interface DashboardMemberAction {
  playerTag: string;
  name: string;
  townHallLevel: number;
  reason: string;
  details?: string;
}

export interface DailyDashboardData {
  clanName: string;
  state?: "ready" | "no_season" | "no_active_war";
  warDay?: number;
  warEndsAt?: string;
  attacksUsed: number;
  attacksAvailable: number;
  availableMembers: number;
  awaitingAvailability: number;
  membersAtEightStars: number;
  membersWithinThreeStars: number;
  season:
    | {
        verificationStatus: "verified";
        position: number;
        groupSize: number;
        stars: number;
        roundsRemaining: number;
        leagueName: string;
        outcome?: "promotion" | "staying" | "demotion";
      }
    | {
        verificationStatus: "unavailable";
        message: string;
      };
  recommendations: {
    remove: DashboardMemberAction[];
    add: DashboardMemberAction[];
  };
  recommendationId?: string;
  finalChanges?: Array<{ outPlayerTag: string; inPlayerTag: string }>;
  contacts: Array<{ playerTag: string; name: string; reason: string }>;
  warnings?: Array<{ code: "stale" | "invalidIp" | "coverage_gap" | "limited_confidence"; message: string }>;
  updatedAt?: string;
}

interface DailyDashboardProps {
  data: DailyDashboardData;
  now?: Date;
  onApprove?: () => void;
  onEdit?: () => void;
  actionsDisabled?: boolean;
}

function formatTimeRemaining(endTime: string, now: Date): string {
  const secondsRemaining = Math.max(0, Math.floor((new Date(endTime).getTime() - now.getTime()) / 1_000));
  const hours = Math.floor(secondsRemaining / 3_600);
  const minutes = Math.floor((secondsRemaining % 3_600) / 60);
  const seconds = secondsRemaining % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function ordinal(value: number): string {
  const remainder100 = value % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function ActionGroup({ title, actions }: { title: string; actions: DashboardMemberAction[] }) {
  const [expandedPlayer, setExpandedPlayer] = useState<string>();

  return (
    <section className="action-group">
      <h3>{title}</h3>
      {actions.map((action) => (
        <article className="member-action" key={action.playerTag}>
          <span className="town-hall">TH{action.townHallLevel}</span>
          <div className="member-copy"><strong>{action.name}</strong><p>{action.reason}</p></div>
          {action.details ? (
            <>
              <button type="button" onClick={() => setExpandedPlayer(expandedPlayer === action.playerTag ? undefined : action.playerTag)}>
                Why {action.name}?
              </button>
              {expandedPlayer === action.playerTag ? <p className="recommendation-details">{action.details}</p> : null}
            </>
          ) : null}
        </article>
      ))}
    </section>
  );
}

export function DailyDashboard({ data, now = new Date(), onApprove, onEdit, actionsDisabled = false }: DailyDashboardProps) {
  const [currentTime, setCurrentTime] = useState(now);
  const verifiedSeason = data.season.verificationStatus === "verified" ? data.season : undefined;
  const outcomeText = verifiedSeason?.outcome ? ` · currently ${verifiedSeason.outcome} in ${verifiedSeason.leagueName}` : "";
  const operationalState = data.state ?? "ready";
  const hasActiveWar = operationalState === "ready" && Boolean(data.warEndsAt);
  const stateMessage = operationalState === "no_season"
    ? "No current CWL season is available."
    : operationalState === "no_active_war"
      ? "No active CWL war is available."
      : undefined;

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <p className="eyebrow">{data.clanName}{data.warDay ? ` · War day ${data.warDay}` : " · CWL operations"}</p>
        <h1>Daily command</h1>
      </header>
      <p className="data-freshness">{data.updatedAt ? `Data refreshed ${new Date(data.updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })}` : "Data freshness unavailable"}</p>
      {stateMessage ? <p className="operational-state" role="status">{stateMessage}</p> : null}
      {data.warnings?.map((warning) => <div className="dashboard-warning" role="alert" key={`${warning.code}:${warning.message}`}>{warning.message}</div>)}
      <section className="daily-summary" aria-label="Daily summary">
        <div className="metric">
          <span>Time remaining</span>
          <strong>{hasActiveWar ? formatTimeRemaining(data.warEndsAt!, currentTime) : "—"}</strong>
          <small>{hasActiveWar ? <>Ends <time dateTime={data.warEndsAt}>{new Date(data.warEndsAt!).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}</time></> : "API end time unavailable"}</small>
        </div>
        <div className="metric"><span>Attacks used</span><strong>{hasActiveWar ? `${data.attacksUsed} / ${data.attacksAvailable}` : "—"}</strong>{hasActiveWar ? <div className="progress" aria-hidden="true"><i style={{ width: `${data.attacksAvailable > 0 ? (data.attacksUsed / data.attacksAvailable) * 100 : 0}%` }} /></div> : null}</div>
        <div className="metric"><span>Members available</span><strong>{hasActiveWar ? data.availableMembers : "—"}</strong>{hasActiveWar ? <small>{data.awaitingAvailability} awaiting confirmation</small> : null}</div>
        <div className="metric">
          <span>Members at 8+ stars</span>
          <strong>{hasActiveWar ? data.membersAtEightStars : "—"}</strong>
          {hasActiveWar && data.membersWithinThreeStars > 0 ? <small>{data.membersWithinThreeStars} more within 3 stars</small> : null}
        </div>
      </section>
      <aside className="season-summary">
        <h2>Season position</h2>
        <p>{data.season.verificationStatus === "verified"
          ? `${ordinal(data.season.position)} of ${data.season.groupSize} clans${outcomeText}`
          : data.season.message}</p>
        <a href="#/season">View season details</a>
      </aside>
      {data.contacts.length > 0 ? <section className="contact-needed">
        <h2>Contact needed</h2>
        {data.contacts.map((contact) => <p key={contact.playerTag}>{contact.name} — {contact.reason}</p>)}
      </section> : null}
      <section className="lineup-actions" aria-label="Recommended lineup update">
        {data.recommendations.remove.length === 0 && data.recommendations.add.length === 0 ? <p className="empty-state">{hasActiveWar ? "No lineup changes recommended" : "Lineup recommendations are unavailable."}</p> : <>
          <ActionGroup title="Remove these members" actions={data.recommendations.remove} />
          <ActionGroup title="Add these members" actions={data.recommendations.add} />
        </>}
      </section>
      {data.recommendations.remove.length > 0 || data.recommendations.add.length > 0 ? <footer className="dashboard-actions">
        <button type="button" disabled={actionsDisabled} onClick={onEdit}>Edit lineup</button>
        <button className="primary-button" type="button" disabled={actionsDisabled} onClick={onApprove}>Approve changes</button>
      </footer> : null}
    </main>
  );
}
