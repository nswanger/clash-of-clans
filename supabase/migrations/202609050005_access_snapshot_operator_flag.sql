-- People in Admin show an `operator` pill beside the role (#117). The role is
-- orthogonal to admin/leader, so it travels as its own flag rather than widening
-- the two-valued `role`. Everything else in this function is unchanged from
-- 202607200013_access_management_hardening.sql.
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

comment on function public.get_access_management_snapshot(integer) is
  'Returns admin-only people (with operator flag), invitation history, and access audit data without invitation tokens or hashes.';
