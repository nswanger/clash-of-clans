/* The claim screen (#134): the fourth auth-shell state, between a session
 * and the routes.
 *
 * Owed once per person: when they have no linked player and have not chosen
 * Not in the clan. The claim is trusted, not verified. It records who is who
 * and gates nothing, which is why a guest gets exactly the access they would
 * have had anyway. A roster that failed to load or is empty still leaves the
 * guest choice, so nobody is stuck here.
 */
import { useCallback, useEffect, useState } from "react";
import { Mark } from "../design/mark.js";
import { claimPlayer, declinePlayerLink, loadLinkablePlayers, type InvitationClient, type LinkablePlayer } from "../data/operations.js";
import { PlayerPicker } from "./player-picker.js";
import "./auth-shell.css";

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PlayerClaim({ client, clanTag, onAnswered }: { client: InvitationClient; clanTag: string; onAnswered(): void }) {
  const [players, setPlayers] = useState<LinkablePlayer[]>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlayers(await loadLinkablePlayers(client, clanTag));
      setLoadError(undefined);
    } catch (error) {
      setLoadError(message(error, "Unable to load clan members."));
    }
  }, [client, clanTag]);

  useEffect(() => { void load(); }, [load]);

  const answer = async (action: () => Promise<void>, fallback: string) => {
    setPending(true);
    setActionError(undefined);
    try {
      await action();
      onAnswered();
    } catch (error) {
      setActionError(message(error, fallback));
      /* A claim refused because someone took the tag meanwhile leaves a stale
         list; reloading it is what makes the next pick an honest one. */
      void load();
    } finally {
      setPending(false);
    }
  };

  return <main className="auth-shell auth-claim" aria-busy={!players && !loadError}>
    <Mark variant="head" className="auth-mark" fill="var(--cm-accent-fill)" />
    <h1>Which member are you?</h1>
    {loadError ? <p className="auth-error" role="alert">{loadError}</p> : null}
    {players
      ? <PlayerPicker
          className="auth-picker"
          players={players}
          disabled={pending}
          onPick={(player) => void answer(() => claimPlayer(client, player.playerTag), "Unable to link your account.")}
        />
      : null}
    {actionError ? <p className="auth-error" role="alert">{actionError}</p> : null}
    <button
      className="cm-ghost"
      type="button"
      disabled={pending}
      onClick={() => void answer(() => declinePlayerLink(client), "Unable to continue as a guest.")}
    >Not in the clan</button>
  </main>;
}
