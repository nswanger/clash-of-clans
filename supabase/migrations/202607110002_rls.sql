create or replace function public.has_app_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_app_role('admin'::public.app_role)
      or public.has_app_role('leader'::public.app_role);
$$;

revoke all on function public.has_app_role(public.app_role) from public;
revoke all on function public.is_leader() from public;
grant execute on function public.has_app_role(public.app_role) to authenticated;
grant execute on function public.is_leader() to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.cwl_seasons enable row level security;
alter table public.cwl_members enable row level security;
alter table public.cwl_wars enable row level security;
alter table public.cwl_war_members enable row level security;
alter table public.cwl_attacks enable row level security;
alter table public.collection_runs enable row level security;
alter table public.collection_attempts enable row level security;
alter table public.raw_snapshots enable row level security;
alter table public.member_availability enable row level security;
alter table public.recommendations enable row level security;
alter table public.leader_decisions enable row level security;
alter table public.audit_events enable row level security;

create policy "Leaders read profiles" on public.profiles for select to authenticated using (public.is_leader());
create policy "Users read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Admins manage roles" on public.user_roles for all to authenticated using (public.has_app_role('admin')) with check (public.has_app_role('admin'));
create policy "Admins manage invitations" on public.invitations for all to authenticated using (public.has_app_role('admin')) with check (public.has_app_role('admin'));

create policy "Leaders read seasons" on public.cwl_seasons for select to authenticated using (public.is_leader());
create policy "Leaders read members" on public.cwl_members for select to authenticated using (public.is_leader());
create policy "Leaders read wars" on public.cwl_wars for select to authenticated using (public.is_leader());
create policy "Leaders read war members" on public.cwl_war_members for select to authenticated using (public.is_leader());
create policy "Leaders read attacks" on public.cwl_attacks for select to authenticated using (public.is_leader());
create policy "Leaders read collection runs" on public.collection_runs for select to authenticated using (public.is_leader());
create policy "Leaders read collection attempts" on public.collection_attempts for select to authenticated using (public.is_leader());
create policy "Leaders read snapshots" on public.raw_snapshots for select to authenticated using (public.is_leader());
create policy "Leaders read recommendations" on public.recommendations for select to authenticated using (public.is_leader());
create policy "Leaders read audit events" on public.audit_events for select to authenticated using (public.is_leader());

create policy "Leaders read availability" on public.member_availability for select to authenticated using (public.is_leader());
create policy "Leaders write availability" on public.member_availability for all to authenticated
  using (public.is_leader())
  with check (public.is_leader() and recorded_by = auth.uid());

create policy "Leaders read decisions" on public.leader_decisions for select to authenticated using (public.is_leader());
create policy "Leaders create decisions" on public.leader_decisions for insert to authenticated
  with check (public.is_leader() and actor_id = auth.uid());
create policy "Leaders update decisions" on public.leader_decisions for update to authenticated
  using (public.is_leader() and actor_id = auth.uid())
  with check (public.is_leader() and actor_id = auth.uid());

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
    and expires_at > now()
  returning id into claimed_invitation_id;

  if claimed_invitation_id is null then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;

  insert into public.user_roles (user_id, role)
  values (current_user_id, 'leader'::public.app_role)
  on conflict (user_id, role) do nothing;
end;
$$;

revoke all on function public.redeem_invitation(text) from public;
grant execute on function public.redeem_invitation(text) to authenticated;

grant select on public.profiles, public.cwl_seasons, public.cwl_members, public.cwl_wars,
  public.cwl_war_members, public.cwl_attacks, public.collection_runs,
  public.collection_attempts, public.raw_snapshots, public.recommendations,
  public.audit_events to authenticated;
grant select, insert, update, delete on public.user_roles, public.invitations, public.member_availability to authenticated;
grant select, insert, update on public.leader_decisions to authenticated;
