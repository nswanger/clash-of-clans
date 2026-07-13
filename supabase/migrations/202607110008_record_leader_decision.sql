create or replace function public.record_leader_decision(
  recommendation_id uuid,
  decision_status public.decision_status,
  final_changes jsonb,
  decision_override_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if not public.is_leader() then
    raise exception 'Leader access required' using errcode = '42501';
  end if;
  if decision_status = 'overridden' and nullif(btrim(decision_override_note), '') is null then
    raise exception 'Override note is required';
  end if;

  update public.recommendations
  set status = case decision_status when 'approved' then 'approved'::public.recommendation_status else 'overridden'::public.recommendation_status end
  where id = record_leader_decision.recommendation_id and status = 'proposed';
  if not found then
    raise exception 'Recommendation is missing or already decided';
  end if;

  insert into public.leader_decisions (recommendation_id, status, final_changes, override_note, actor_id)
  values (record_leader_decision.recommendation_id, decision_status, final_changes, decision_override_note, current_user_id);
end;
$$;

revoke all on function public.record_leader_decision(uuid, public.decision_status, jsonb, text) from public;
grant execute on function public.record_leader_decision(uuid, public.decision_status, jsonb, text) to authenticated;
