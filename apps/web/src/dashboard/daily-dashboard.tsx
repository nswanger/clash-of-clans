import { useState } from "react";

export interface DashboardMemberAction {
  playerTag: string;
  name: string;
  townHallLevel: number;
  reason: string;
  details?: string;
}

export interface DailyDashboardData {
  clanName: string;
  warDay: number;
  warEndsAt: string;
  attacksUsed: number;
  attacksAvailable: number;
  availableMembers: number;
  awaitingAvailability: number;
  membersAtEightStars: number;
  membersWithinThreeStars: number;
  season: {
    position: number;
    groupSize: number;
    stars: number;
    roundsRemaining: number;
    leagueName: string;
    outcome?: "promotion" | "staying" | "demotion";
  };
  recommendations: {
    remove: DashboardMemberAction[];
    add: DashboardMemberAction[];
  };
  warnings?: Array<{ code: "stale" | "invalidIp" | "coverage_gap" | "limited_confidence"; message: string }>;
  updatedAt: string;
}

interface DailyDashboardProps {
  data: DailyDashboardData;
  now?: Date;
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

export function DailyDashboard({ data, now = new Date() }: DailyDashboardProps) {
  const outcomeText = data.season.outcome ? ` · currently ${data.season.outcome} in ${data.season.leagueName}` : "";

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <p className="eyebrow">{data.clanName} · War day {data.warDay}</p>
        <h1>Daily command</h1>
      </header>
      {data.warnings?.map((warning) => <div className="dashboard-warning" role="alert" key={`${warning.code}:${warning.message}`}>{warning.message}</div>)}
      <section className="daily-summary" aria-label="Daily summary">
        <div className="metric"><span>Time remaining</span><strong>{formatTimeRemaining(data.warEndsAt, now)}</strong></div>
        <div className="metric"><span>Attacks used</span><strong>{data.attacksUsed} / {data.attacksAvailable}</strong><div className="progress" aria-hidden="true"><i style={{ width: `${(data.attacksUsed / data.attacksAvailable) * 100}%` }} /></div></div>
        <div className="metric"><span>Members available</span><strong>{data.availableMembers}</strong><small>{data.awaitingAvailability} awaiting confirmation</small></div>
        <div className="metric">
          <span>Members at 8+ stars</span>
          <strong>{data.membersAtEightStars}</strong>
          {data.membersWithinThreeStars > 0 ? <small>{data.membersWithinThreeStars} more within 3 stars</small> : null}
        </div>
      </section>
      <aside className="season-summary">{ordinal(data.season.position)} of {data.season.groupSize} clans{outcomeText}</aside>
      <section className="lineup-actions" aria-label="Recommended lineup update">
        {data.recommendations.remove.length === 0 && data.recommendations.add.length === 0 ? <p className="empty-state">No lineup changes recommended</p> : <>
          <ActionGroup title="Remove these members" actions={data.recommendations.remove} />
          <ActionGroup title="Add these members" actions={data.recommendations.add} />
        </>}
      </section>
    </main>
  );
}
