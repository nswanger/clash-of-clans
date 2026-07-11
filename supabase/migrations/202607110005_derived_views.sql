create or replace view public.cwl_current_seasons
with (security_invoker = true) as
select distinct on (clan_tag)
  clan_tag,
  season_id
from public.cwl_seasons
order by clan_tag, season_id desc;

create or replace view public.cwl_current_season_assignments
with (security_invoker = true) as
select
  war.clan_tag,
  war.season_id,
  war.war_tag,
  war.war_day,
  war.state as war_state,
  assignment.player_tag,
  assignment.map_position,
  assignment.town_hall_level,
  assignment.assigned_attacks
from public.cwl_current_seasons current_season
join public.cwl_wars war
  on war.clan_tag = current_season.clan_tag
 and war.season_id = current_season.season_id
join public.cwl_war_members assignment on assignment.war_tag = war.war_tag;

create or replace view public.cwl_completed_missed_attacks
with (security_invoker = true) as
select
  assignment.clan_tag,
  assignment.season_id,
  assignment.war_tag,
  assignment.war_day,
  assignment.player_tag,
  assignment.assigned_attacks,
  least(count(attack.attack_order), assignment.assigned_attacks::bigint)::integer as completed_assigned_attacks,
  greatest(assignment.assigned_attacks::bigint - count(attack.attack_order), 0)::integer as missed_assigned_attacks
from public.cwl_current_season_assignments assignment
left join public.cwl_attacks attack
  on attack.war_tag = assignment.war_tag
 and attack.attacker_tag = assignment.player_tag
where assignment.war_state = 'warEnded'
group by assignment.clan_tag, assignment.season_id, assignment.war_tag, assignment.war_day,
  assignment.player_tag, assignment.assigned_attacks;

create or replace view public.cwl_member_stars
with (security_invoker = true) as
select
  assignment.clan_tag,
  assignment.season_id,
  assignment.player_tag,
  coalesce(sum(attack.stars), 0)::integer as stars
from public.cwl_current_season_assignments assignment
left join public.cwl_attacks attack
  on attack.war_tag = assignment.war_tag
 and attack.attacker_tag = assignment.player_tag
group by assignment.clan_tag, assignment.season_id, assignment.player_tag;

create or replace view public.cwl_member_opportunities
with (security_invoker = true) as
select
  clan_tag,
  season_id,
  player_tag,
  sum(assigned_attacks)::integer as assigned_opportunities,
  sum(completed_assigned_attacks)::integer as completed_assigned_attacks,
  sum(missed_assigned_attacks)::integer as missed_assigned_attacks
from public.cwl_completed_missed_attacks
group by clan_tag, season_id, player_tag;

create or replace view public.cwl_eight_star_eligibility
with (security_invoker = true) as
select
  member.clan_tag,
  member.season_id,
  member.player_tag,
  coalesce(stars.stars, 0) as stars,
  coalesce(stars.stars, 0) >= 8 as eight_star_eligible
from public.cwl_members member
join public.cwl_current_seasons current_season
  on current_season.clan_tag = member.clan_tag
 and current_season.season_id = member.season_id
left join public.cwl_member_stars stars
  on stars.clan_tag = member.clan_tag
 and stars.season_id = member.season_id
 and stars.player_tag = member.player_tag;

create or replace view public.cwl_current_reliability
with (security_invoker = true) as
select
  member.clan_tag,
  member.season_id,
  member.player_tag,
  coalesce(opportunities.assigned_opportunities, 0) as assigned_opportunities,
  coalesce(opportunities.completed_assigned_attacks, 0) as completed_assigned_attacks,
  case
    when coalesce(opportunities.assigned_opportunities, 0) = 0 then null
    else opportunities.completed_assigned_attacks::numeric / opportunities.assigned_opportunities
  end as reliability,
  coalesce(opportunities.assigned_opportunities, 0) = 0 as limited_confidence
from public.cwl_members member
join public.cwl_current_seasons current_season
  on current_season.clan_tag = member.clan_tag
 and current_season.season_id = member.season_id
left join public.cwl_member_opportunities opportunities
  on opportunities.clan_tag = member.clan_tag
 and opportunities.season_id = member.season_id
 and opportunities.player_tag = member.player_tag;

grant select on public.cwl_current_seasons, public.cwl_current_season_assignments,
  public.cwl_completed_missed_attacks, public.cwl_member_stars,
  public.cwl_member_opportunities, public.cwl_eight_star_eligibility,
  public.cwl_current_reliability to authenticated;
