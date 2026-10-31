-- App users carry linked player tags (#134,
-- docs/specs/2026-10-31-player-links-for-app-users.md).
--
-- A person claims their own account once, after redeeming an invitation, or
-- declines and is a guest. Admins link, unlink and remap anyone. The link
-- gates nothing: it records who is who, so the People list can mark a leader
-- whose every linked account has left the clan. Claims are trusted, not
-- verified, and the audit event type keeps a self-claim apart from an admin's
-- link.
--
-- Links survive revoked access (the profile does). A tag held only by someone
-- without access moves to whoever links it next, because revoked people are
-- not in People and an admin could not otherwise find the link to remove it.

alter table public.profiles
  add column if not exists player_link_declined_at timestamptz;

comment on column public.profiles.player_link_declined_at is
  'When this person chose Not in the clan at the claim screen; cleared by any link and by redeeming an invitation (#134).';

create table if not exists public.profile_player_links (
  user_id uuid not null references public.profiles(id) on delete cascade,
  player_tag text not null check (btrim(player_tag) <> ''),
  linked_at timestamptz not null default now(),
  linked_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, player_tag),
  constraint profile_player_links_player_tag_unique unique (player_tag)
);

comment on table public.profile_player_links is
  'Which in-game accounts an app user is. Self-claimed (linked_by = user_id) or set by an admin; never verified against the Clash API (#134).';

alter table public.profile_player_links enable row level security;

drop policy if exists "Admins read player links" on public.profile_player_links;
create policy "Admins read player links"
  on public.profile_player_links for select to authenticated
  using (public.has_app_role('admin'::public.app_role));

-- The session reads its own rows to decide whether to show the claim screen.
drop policy if exists "Users read own player links" on public.profile_player_links;
create policy "Users read own player links"
  on public.profile_player_links for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.profile_player_links from anon, authenticated;
grant select on table public.profile_player_links to authenticated;

create or replace function public.audit_player_link_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_link public.profile_player_links%rowtype;
begin
  changed_link := case when TG_OP = 'DELETE' then old else new end;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, event_data)
  values (
    case when TG_OP = 'DELETE' then auth.uid() else changed_link.linked_by end,
    case
      when TG_OP = 'DELETE' then 'player_unlinked'
      when changed_link.linked_by = changed_link.user_id then 'player_claimed'
      else 'player_linked'
    end,
    'player_link',
    changed_link.user_id::text || ':' || changed_link.player_tag,
    jsonb_build_object('userId', changed_link.user_id, 'playerTag', changed_link.player_tag)
  );
  return changed_link;
end;
$$;

drop trigger if exists audit_player_link_after_change on public.profile_player_links;
create trigger audit_player_link_after_change
after insert or delete on public.profile_player_links
for each row execute function public.audit_player_link_change();

-- The shared write behind claim_player and link_player. Not granted: both
-- callers check who may write before they reach it.
create or replace function public.attach_player_tag(target_user_id uuid, requested_player_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  holder_id uuid;
begin
  if not exists (
    select 1 from public.member_roster_overview roster
    where roster.player_tag = requested_player_tag and roster.is_current_member
  ) then
    raise exception 'Player is not a current clan member';
  end if;

  lock table public.profile_player_links in share row exclusive mode;
  select link.user_id into holder_id
  from public.profile_player_links link
  where link.player_tag = requested_player_tag;

  if holder_id = target_user_id then
    raise exception 'Player is already linked to this account';
  end if;
  if holder_id is not null then
    if exists (select 1 from public.user_roles where user_id = holder_id) then
      raise exception 'Player is linked to someone else';
    end if;
    delete from public.profile_player_links where player_tag = requested_player_tag;
  end if;

  insert into public.profile_player_links (user_id, player_tag, linked_by)
  values (target_user_id, requested_player_tag, auth.uid());
  update public.profiles set player_link_declined_at = null where id = target_user_id;
end;
$$;

revoke all on function public.attach_player_tag(uuid, text) from public;

create or replace function public.claim_player(player_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_leader() then
    raise exception 'Leader access required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profile_player_links where user_id = current_user_id) then
    raise exception 'Your account is already linked to a player';
  end if;

  perform public.attach_player_tag(current_user_id, claim_player.player_tag);
end;
$$;

create or replace function public.decline_player_link()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or not public.is_leader() then
    raise exception 'Leader access required' using errcode = '42501';
  end if;
  if exists (select 1 from public.profile_player_links where user_id = current_user_id) then
    raise exception 'Your account is already linked to a player';
  end if;

  update public.profiles
  set player_link_declined_at = now()
  where id = current_user_id and player_link_declined_at is null;
end;
$$;

create or replace function public.link_player(target_user_id uuid, player_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles where user_id = target_user_id) then
    raise exception 'Target user does not have access';
  end if;

  perform public.attach_player_tag(target_user_id, link_player.player_tag);
end;
$$;

create or replace function public.unlink_player(target_user_id uuid, player_tag text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  delete from public.profile_player_links link
  where link.user_id = target_user_id and link.player_tag = unlink_player.player_tag;
  if not found then
    raise exception 'Player is not linked to this account';
  end if;
end;
$$;

-- The claim screen and the admin link panel. Leaders cannot read other
-- people's links, so the "already held" filter has to happen here.
create or replace function public.list_linkable_players(requested_clan_tag text)
returns table (player_tag text, name text, town_hall_level smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_leader() then
    raise exception 'Leader access required' using errcode = '42501';
  end if;

  return query
  select roster.player_tag, roster.name, roster.town_hall_level
  from public.member_roster_overview roster
  where roster.clan_tag = requested_clan_tag
    and roster.is_current_member
    and not exists (
      select 1
      from public.profile_player_links link
      join public.user_roles holder_role on holder_role.user_id = link.user_id
      where link.player_tag = roster.player_tag
    )
  order by roster.name, roster.player_tag;
end;
$$;

revoke all on function public.claim_player(text) from public;
revoke all on function public.decline_player_link() from public;
revoke all on function public.link_player(uuid, text) from public;
revoke all on function public.unlink_player(uuid, text) from public;
revoke all on function public.list_linkable_players(text) from public;
grant execute on function public.claim_player(text) to authenticated;
grant execute on function public.decline_player_link() to authenticated;
grant execute on function public.link_player(uuid, text) to authenticated;
grant execute on function public.unlink_player(uuid, text) to authenticated;
grant execute on function public.list_linkable_players(text) to authenticated;

-- Unchanged from 202607200013_access_management_hardening.sql except the last
-- statement: a guest who returns on a new invitation is asked again.
create or replace function public.redeem_invitation(token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  claimed_invitation_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.invitations
  set used_at = now(), used_by = current_user_id
  where token_hash = extensions.digest(token, 'sha256')
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  returning id into claimed_invitation_id;

  if claimed_invitation_id is null then
    raise exception 'Invitation is invalid, expired, revoked, or already used';
  end if;

  insert into public.user_roles (user_id, role)
  values (current_user_id, 'leader'::public.app_role)
  on conflict (user_id, role) do nothing;

  update public.profiles set player_link_declined_at = null where id = current_user_id;
end;
$$;

-- Each person gains `players`, and the access-log filter gains the three link
-- events with the person as target. Everything else is unchanged from
-- 202609050005_access_snapshot_operator_flag.sql.
create or replace function public.get_access_management_snapshot(access_audit_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if access_audit_limit < 1 or access_audit_limit > 200 then
    raise exception 'Access audit limit must be between 1 and 200';
  end if;

  select jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(person order by person->>'name', person->>'id')
      from (
        select jsonb_build_object(
          'id', roles.user_id,
          'name', coalesce(profile.display_name, roles.user_id::text),
          'role', case when bool_or(roles.role = 'admin'::public.app_role) then 'admin' else 'leader' end,
          'isOperator', bool_or(roles.role = 'operator'::public.app_role),
          'isCurrentUser', roles.user_id = auth.uid(),
          'players', coalesce((
            select jsonb_agg(jsonb_build_object(
              'tag', link.player_tag,
              'name', roster.name,
              'isCurrentMember', coalesce(roster.is_current_member, false),
              'departureObservedOn', roster.departure_observed_on
            ) order by roster.name nulls last, link.player_tag)
            from public.profile_player_links link
            -- A tag can sit in more than one clan's history (a feeder clan);
            -- the row that says it is current wins, then the latest sighting.
            left join lateral (
              select overview.name, overview.is_current_member, overview.departure_observed_on
              from public.member_roster_overview overview
              where overview.player_tag = link.player_tag
              order by overview.is_current_member desc, overview.last_observed_present_on desc
              limit 1
            ) roster on true
            where link.user_id = roles.user_id
          ), '[]'::jsonb)
        ) as person
        from public.user_roles roles
        left join public.profiles profile on profile.id = roles.user_id
        group by roles.user_id, profile.display_name
      ) people
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(invitation order by invitation->>'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', invitations.id,
          'status', case
            when invitations.used_at is not null then 'redeemed'
            when invitations.revoked_at is not null then 'revoked'
            when invitations.expires_at <= now() then 'expired'
            else 'pending'
          end,
          'createdAt', invitations.created_at,
          'expiresAt', invitations.expires_at,
          'createdByName', coalesce(creator.display_name, invitations.created_by::text),
          'usedAt', invitations.used_at,
          'usedByName', case when invitations.used_by is null then null else coalesce(invitee.display_name, invitations.used_by::text) end,
          'revokedAt', invitations.revoked_at,
          'revokedByName', case when invitations.revoked_by is null then null else coalesce(revoker.display_name, invitations.revoked_by::text) end,
          'reissuedFromId', invitations.reissued_from_id,
          'reissuedInvitationId', replacement.id
        ) as invitation
        from public.invitations invitations
        left join public.profiles creator on creator.id = invitations.created_by
        left join public.profiles invitee on invitee.id = invitations.used_by
        left join public.profiles revoker on revoker.id = invitations.revoked_by
        left join public.invitations replacement on replacement.reissued_from_id = invitations.id
      ) invitation_history
    ), '[]'::jsonb),
    'auditEvents', coalesce((
      select jsonb_agg(event order by event->>'occurredAt' desc)
      from (
        select jsonb_build_object(
          'id', audit.id,
          'eventType', audit.event_type,
          'actorName', case when audit.actor_id is null then 'System' else coalesce(actor.display_name, audit.actor_id::text) end,
          'targetName', case
            when audit.entity_type in ('user_role', 'player_link') then coalesce(target.display_name, audit.event_data->>'userId')
            when audit.event_type = 'invitation_redeemed' then coalesce(actor.display_name, audit.actor_id::text)
            else null
          end,
          'eventData', audit.event_data,
          'occurredAt', audit.occurred_at
        ) as event
        from public.audit_events audit
        left join public.profiles actor on actor.id = audit.actor_id
        left join public.profiles target
          on audit.entity_type in ('user_role', 'player_link')
          and target.id = (audit.event_data->>'userId')::uuid
        where audit.event_type in (
          'invitation_created', 'invitation_redeemed', 'invitation_revoked',
          'invitation_reissued', 'role_granted', 'role_revoked',
          'player_claimed', 'player_linked', 'player_unlinked'
        )
        order by audit.occurred_at desc
        limit access_audit_limit
      ) access_events
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

comment on function public.get_access_management_snapshot(integer) is
  'Returns admin-only people (with operator flag and linked players), invitation history, and access audit data without invitation tokens or hashes.';
