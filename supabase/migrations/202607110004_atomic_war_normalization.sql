create or replace function public.apply_cwl_war_unit(
  p_war jsonb,
  p_members jsonb,
  p_attacks jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_war_tag text := p_war ->> 'war_tag';
begin
  if v_war_tag is null or btrim(v_war_tag) = '' then
    raise exception 'war_tag is required';
  end if;

  insert into public.cwl_wars (
    war_tag, clan_tag, season_id, war_day, state, preparation_start_time,
    start_time, end_time, opponent_tag, attacks_per_member, updated_at
  ) values (
    v_war_tag, p_war ->> 'clan_tag', p_war ->> 'season_id', (p_war ->> 'war_day')::smallint,
    p_war ->> 'state', (p_war ->> 'preparation_start_time')::timestamptz,
    (p_war ->> 'start_time')::timestamptz, (p_war ->> 'end_time')::timestamptz,
    p_war ->> 'opponent_tag', coalesce((p_war ->> 'attacks_per_member')::smallint, 1), now()
  )
  on conflict (war_tag) do update set
    clan_tag = excluded.clan_tag, season_id = excluded.season_id, war_day = excluded.war_day,
    state = excluded.state, preparation_start_time = excluded.preparation_start_time,
    start_time = excluded.start_time, end_time = excluded.end_time, opponent_tag = excluded.opponent_tag,
    attacks_per_member = excluded.attacks_per_member, updated_at = excluded.updated_at;

  -- A league-war response is authoritative. Replacing child facts inside this
  -- transaction also permits corrected map positions without transient unique conflicts.
  delete from public.cwl_attacks where war_tag = v_war_tag;
  delete from public.cwl_war_members where war_tag = v_war_tag;

  insert into public.cwl_war_members (war_tag, player_tag, map_position, town_hall_level, assigned_attacks)
  select war_tag, player_tag, map_position, town_hall_level, assigned_attacks
  from jsonb_to_recordset(coalesce(p_members, '[]'::jsonb)) as member(
    war_tag text, player_tag text, map_position smallint, town_hall_level smallint, assigned_attacks smallint
  )
  on conflict (war_tag, player_tag) do update set
    map_position = excluded.map_position, town_hall_level = excluded.town_hall_level,
    assigned_attacks = excluded.assigned_attacks;

  insert into public.cwl_attacks (
    war_tag, attacker_tag, attack_order, defender_tag, stars, destruction, duration_seconds, recorded_at
  )
  select war_tag, attacker_tag, attack_order, defender_tag, stars, destruction, duration_seconds, recorded_at
  from jsonb_to_recordset(coalesce(p_attacks, '[]'::jsonb)) as attack(
    war_tag text, attacker_tag text, attack_order smallint, defender_tag text, stars smallint,
    destruction numeric(5,2), duration_seconds integer, recorded_at timestamptz
  )
  on conflict (war_tag, attacker_tag, attack_order) do update set
    defender_tag = excluded.defender_tag, stars = excluded.stars, destruction = excluded.destruction,
    duration_seconds = excluded.duration_seconds, recorded_at = excluded.recorded_at;

end;
$$;

revoke all on function public.apply_cwl_war_unit(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_cwl_war_unit(jsonb, jsonb, jsonb) to service_role;
