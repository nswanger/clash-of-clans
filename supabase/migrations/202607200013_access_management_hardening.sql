alter table public.invitations
  add column revoked_at timestamptz,
  add column revoked_by uuid references public.profiles(id) on delete set null,
  add column reissued_from_id uuid references public.invitations(id) on delete restrict,
  add constraint invitations_revocation_pair_check
    check ((revoked_at is null) = (revoked_by is null)),
  add constraint invitations_single_terminal_state_check
    check (used_at is null or revoked_at is null),
  add constraint invitations_reissued_from_unique unique (reissued_from_id);

drop policy "Admins manage roles" on public.user_roles;
drop policy "Admins manage invitations" on public.invitations;

create policy "Admins read roles"
on public.user_roles for select to authenticated
using (public.has_app_role('admin'::public.app_role));

create policy "Admins read invitations"
on public.invitations for select to authenticated
using (public.has_app_role('admin'::public.app_role));

revoke insert, update, delete on public.user_roles, public.invitations from authenticated;

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
end;
$$;

create or replace function public.revoke_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.invitations
  set revoked_at = now(), revoked_by = auth.uid()
  where id = invitation_id
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invitation is no longer pending';
  end if;
end;
$$;

create or replace function public.reissue_invitation(
  invitation_id uuid,
  invitation_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_token text;
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if invitation_expires_at <= now() then
    raise exception 'Invitation expiration must be in the future';
  end if;

  update public.invitations
  set revoked_at = now(), revoked_by = current_user_id
  where id = invitation_id
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'Invitation is no longer pending';
  end if;

  invitation_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.invitations (token_hash, expires_at, created_by, reissued_from_id)
  values (
    extensions.digest(invitation_token, 'sha256'),
    invitation_expires_at,
    current_user_id,
    invitation_id
  );
  return invitation_token;
end;
$$;

create or replace function public.promote_to_admin(target_user_id uuid)
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

  insert into public.user_roles (user_id, role, created_by)
  values (target_user_id, 'admin'::public.app_role, auth.uid())
  on conflict (user_id, role) do nothing;
end;
$$;

create or replace function public.demote_to_leader(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot demote your own account';
  end if;

  lock table public.user_roles in share row exclusive mode;
  if not exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role = 'admin'::public.app_role
  ) then
    raise exception 'Target user is not an admin';
  end if;
  if (select count(*) from public.user_roles where role = 'admin'::public.app_role) <= 1 then
    raise exception 'The final admin cannot be demoted';
  end if;

  insert into public.user_roles (user_id, role, created_by)
  values (target_user_id, 'leader'::public.app_role, auth.uid())
  on conflict (user_id, role) do nothing;
  delete from public.user_roles
  where user_id = target_user_id and role = 'admin'::public.app_role;
end;
$$;

create or replace function public.revoke_user_access(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_admin boolean;
begin
  if not public.has_app_role('admin'::public.app_role) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot revoke your own access';
  end if;

  lock table public.user_roles in share row exclusive mode;
  if not exists (select 1 from public.user_roles where user_id = target_user_id) then
    raise exception 'Target user does not have access';
  end if;

  select exists (
    select 1 from public.user_roles
    where user_id = target_user_id and role = 'admin'::public.app_role
  ) into target_is_admin;
  if target_is_admin
    and (select count(*) from public.user_roles where role = 'admin'::public.app_role) <= 1
  then
    raise exception 'The final admin cannot be revoked';
  end if;

  delete from public.user_roles where user_id = target_user_id;
end;
$$;

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
          'isCurrentUser', roles.user_id = auth.uid()
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
            when audit.entity_type = 'user_role' then coalesce(target.display_name, audit.event_data->>'userId')
            when audit.event_type = 'invitation_redeemed' then coalesce(actor.display_name, audit.actor_id::text)
            else null
          end,
          'eventData', audit.event_data,
          'occurredAt', audit.occurred_at
        ) as event
        from public.audit_events audit
        left join public.profiles actor on actor.id = audit.actor_id
        left join public.profiles target
          on audit.entity_type = 'user_role'
          and target.id = (audit.event_data->>'userId')::uuid
        where audit.event_type in (
          'invitation_created', 'invitation_redeemed', 'invitation_revoked',
          'invitation_reissued', 'role_granted', 'role_revoked'
        )
        order by audit.occurred_at desc
        limit access_audit_limit
      ) access_events
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.audit_invitation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, event_data)
    values (
      new.created_by,
      case when new.reissued_from_id is null then 'invitation_created' else 'invitation_reissued' end,
      'invitation',
      new.id::text,
      jsonb_strip_nulls(jsonb_build_object('expiresAt', new.expires_at, 'priorInvitationId', new.reissued_from_id))
    );
  elsif old.used_by is null and new.used_by is not null then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, event_data)
    values (new.used_by, 'invitation_redeemed', 'invitation', new.id::text, '{}'::jsonb);
  elsif old.revoked_at is null and new.revoked_at is not null then
    insert into public.audit_events (actor_id, event_type, entity_type, entity_id, event_data)
    values (new.revoked_by, 'invitation_revoked', 'invitation', new.id::text, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger audit_invitation_after_redemption on public.invitations;
create trigger audit_invitation_after_terminal_change
after update of used_at, used_by, revoked_at, revoked_by on public.invitations
for each row execute function public.audit_invitation_change();

revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.reissue_invitation(uuid, timestamptz) from public;
revoke all on function public.promote_to_admin(uuid) from public;
revoke all on function public.demote_to_leader(uuid) from public;
revoke all on function public.revoke_user_access(uuid) from public;
revoke all on function public.get_access_management_snapshot(integer) from public;

grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.reissue_invitation(uuid, timestamptz) to authenticated;
grant execute on function public.promote_to_admin(uuid) to authenticated;
grant execute on function public.demote_to_leader(uuid) to authenticated;
grant execute on function public.revoke_user_access(uuid) to authenticated;
grant execute on function public.get_access_management_snapshot(integer) to authenticated;

comment on function public.get_access_management_snapshot(integer) is
  'Returns admin-only people, invitation history, and access audit data without invitation tokens or hashes.';
