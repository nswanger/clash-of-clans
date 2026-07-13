import { useEffect, useState } from "react";
import { saveAvailability } from "../data/operations.js";
import { AvailabilityEditor } from "./availability-editor.js";

interface RosterMember { playerTag: string; name: string; status: "available" | "unavailable" | "unknown" }

export function AvailabilityPage({ client, clanTag }: { client: any; clanTag: string }) {
  const [seasonId, setSeasonId] = useState<string>();
  const [members, setMembers] = useState<RosterMember[]>();
  const [error, setError] = useState<string>();
  const [savedMember, setSavedMember] = useState<string>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const seasonResult = await client.from("cwl_seasons").select("season_id").eq("clan_tag", clanTag).order("season_id", { ascending: false }).limit(1).single();
        if (seasonResult.error) throw new Error(seasonResult.error.message);
        const currentSeason = seasonResult.data.season_id as string;
        const [memberResult, availabilityResult] = await Promise.all([
          client.from("cwl_members").select("player_tag,name").eq("clan_tag", clanTag).eq("season_id", currentSeason).order("name"),
          client.from("member_availability").select("player_tag,status").eq("clan_tag", clanTag).eq("season_id", currentSeason),
        ]);
        if (memberResult.error) throw new Error(memberResult.error.message);
        if (availabilityResult.error) throw new Error(availabilityResult.error.message);
        const statuses = new Map(availabilityResult.data.map((row: any) => [row.player_tag, row.status]));
        if (active) {
          setSeasonId(currentSeason);
          setMembers(memberResult.data.map((row: any) => ({ playerTag: row.player_tag, name: row.name, status: statuses.get(row.player_tag) ?? "unknown" })));
        }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Unable to load availability."); }
    })();
    return () => { active = false; };
  }, [client, clanTag]);

  if (error) return <main className="dashboard-shell"><div role="alert">{error}</div></main>;
  if (!members || !seasonId) return <main className="dashboard-shell"><p role="status">Loading availability…</p></main>;
  return <main className="dashboard-shell"><h1>Availability</h1>{savedMember ? <p role="status">Saved availability for {savedMember}.</p> : null}{members.map((member) =>
    <AvailabilityEditor key={member.playerTag} playerName={member.name} initialAvailability={member.status} onSave={({ availability, note }) =>
      void saveAvailability(client, { clanTag, seasonId, playerTag: member.playerTag, status: availability, note }).then(() => setSavedMember(member.name)).catch((reason) => setError(reason.message))
    } />
  )}</main>;
}
