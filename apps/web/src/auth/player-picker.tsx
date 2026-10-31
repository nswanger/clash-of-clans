/* The roster as a pick list (#134): the claim screen and Admin's link panel.
 *
 * Picked, never typed. A mistyped tag would be linked to nobody in the roster
 * and would read as a departure the next day, which is evidence the app made up.
 * The bench's shape: `cm-search` over `cm-rows`, capped at LIST_MAX_ROWS (ADR
 * 0024), so a fifty-member clan is reached by narrowing rather than scrolling.
 */
import { useState } from "react";
import { LIST_MAX_ROWS } from "../design/layout.js";
import type { LinkablePlayer } from "../data/operations.js";

export function rankLinkablePlayers(players: readonly LinkablePlayer[], search: string): LinkablePlayer[] {
  const query = search.trim().toLowerCase();
  return players
    .filter((player) => !query || player.name.toLowerCase().includes(query) || player.playerTag.toLowerCase().includes(query))
    .slice(0, LIST_MAX_ROWS);
}

export function PlayerPicker({ players, disabled = false, className, onPick }: {
  players: readonly LinkablePlayer[];
  disabled?: boolean;
  /* The surface's own prefixed hook, when its layout needs one. */
  className?: string;
  onPick(player: LinkablePlayer): void;
}) {
  const [search, setSearch] = useState("");
  const shown = rankLinkablePlayers(players, search);
  return <div className={className}>
    <input
      className="cm-search"
      type="search"
      placeholder="Find a member"
      aria-label="Find a member"
      value={search}
      onChange={(event) => setSearch(event.target.value)}
    />
    <div className="cm-rows">
      {shown.map((player) => <button
        key={player.playerTag}
        className="cm-row"
        type="button"
        disabled={disabled}
        onClick={() => onPick(player)}
      >
        <span className="cm-row-main"><span className="cm-row-name">{player.name}</span></span>
        <span className="cm-row-th">TH{player.townHallLevel}</span>
      </button>)}
      {shown.length
        ? null
        : <p className="cm-empty">{search ? `No one matches “${search}”.` : "No clan members to pick from."}</p>}
    </div>
  </div>;
}
