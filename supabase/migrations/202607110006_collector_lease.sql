create table public.collector_leases (
  lease_name text primary key check (btrim(lease_name) <> ''),
  owner_id uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.collector_leases enable row level security;

create or replace function public.acquire_collector_lease(
  p_lease_name text,
  p_owner_id uuid,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.collector_leases (lease_name, owner_id, expires_at)
  values (p_lease_name, p_owner_id, p_expires_at)
  on conflict (lease_name) do update
    set owner_id = excluded.owner_id,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.collector_leases.expires_at <= now()
       or public.collector_leases.owner_id = excluded.owner_id;
  return found;
end;
$$;

create or replace function public.release_collector_lease(p_lease_name text, p_owner_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.collector_leases
  where lease_name = p_lease_name and owner_id = p_owner_id;
$$;

create or replace function public.renew_collector_lease(
  p_lease_name text,
  p_owner_id uuid,
  p_expires_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.collector_leases
  set expires_at = p_expires_at, updated_at = now()
  where lease_name = p_lease_name
    and owner_id = p_owner_id
    and expires_at > now();
  return found;
end;
$$;

revoke all on table public.collector_leases from public, anon, authenticated;
revoke all on function public.acquire_collector_lease(text, uuid, timestamptz) from public;
revoke all on function public.release_collector_lease(text, uuid) from public;
revoke all on function public.renew_collector_lease(text, uuid, timestamptz) from public;
grant execute on function public.acquire_collector_lease(text, uuid, timestamptz) to service_role;
grant execute on function public.release_collector_lease(text, uuid) to service_role;
grant execute on function public.renew_collector_lease(text, uuid, timestamptz) to service_role;
