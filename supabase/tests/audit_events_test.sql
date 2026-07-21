BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(12);

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
VALUES
  (
    '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'audit-admin@example.test',
    'x',
    now(),
    '{}',
    '{"name":"Audit Admin"}'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'audit-leader@example.test',
    'x',
    now(),
    '{}',
    '{"name":"Audit Leader"}'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'audit-invitee@example.test',
    'x',
    now(),
    '{}',
    '{"name":"Audit Invitee"}'
  );

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'admin'),
  ('40000000-0000-0000-0000-000000000002', 'leader');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

CREATE TEMPORARY TABLE audit_invitation_token AS
SELECT public.create_invitation(now() + INTERVAL '1 day') AS value;

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'invitation_created'
      AND actor_id = '40000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'invitation creation is audited with the admin actor'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'invitation_created'
      AND event_data ? 'token_hash'
  ),
  0::bigint,
  'invitation audit data excludes the token hash'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000003', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.redeem_invitation((SELECT audit_invitation_token.value FROM audit_invitation_token));

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'invitation_redeemed'
      AND actor_id = '40000000-0000-0000-0000-000000000003'
  ),
  1::bigint,
  'invitation redemption is audited with the invitee actor'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'role_granted'
      AND entity_id = '40000000-0000-0000-0000-000000000003:leader'
  ),
  1::bigint,
  'invitation redemption audits the leader grant'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.revoke_user_access('40000000-0000-0000-0000-000000000003');

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'role_revoked'
      AND actor_id = '40000000-0000-0000-0000-000000000001'
      AND entity_id = '40000000-0000-0000-0000-000000000003:leader'
  ),
  1::bigint,
  'role revocation is audited with the admin actor'
);

INSERT INTO public.cwl_seasons (
  clan_tag,
  season_id,
  war_size,
  target_core_size,
  rotation_positions
)
VALUES ('#AUDIT', '2026-07', 15, 10, 5);

INSERT INTO public.cwl_members (
  clan_tag,
  season_id,
  player_tag,
  name,
  town_hall_level
)
VALUES ('#AUDIT', '2026-07', '#AUDITPLAYER', 'Audit Player', 17);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO public.member_availability (
  clan_tag,
  season_id,
  player_tag,
  status,
  note,
  recorded_by
)
VALUES (
  '#AUDIT',
  '2026-07',
  '#AUDITPLAYER',
  'available',
  'private operational note',
  auth.uid()
);
UPDATE public.member_availability
SET
  status = 'unavailable',
  recorded_at = now()
WHERE clan_tag = '#AUDIT'
  AND season_id = '2026-07'
  AND player_tag = '#AUDITPLAYER';

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'availability_changed'
      AND actor_id = '40000000-0000-0000-0000-000000000002'
  ),
  2::bigint,
  'availability inserts and updates are audited'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'availability_changed'
      AND event_data ? 'note'
  ),
  0::bigint,
  'availability audit data excludes notes'
);

INSERT INTO public.recommendations (
  id,
  clan_tag,
  season_id,
  strategy_version,
  input,
  output,
  source
)
VALUES (
  '40000000-0000-0000-0000-000000000010',
  '#AUDIT',
  '2026-07',
  'ordered-rules-v1',
  '{"context":{"revision":1}}',
  '{"strategyVersion":"ordered-rules-v1","changes":[]}',
  'collection'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT public.record_leader_decision(
  '40000000-0000-0000-0000-000000000010',
  'approved',
  '[]',
  NULL
);

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'recommendation_approved'
      AND actor_id = '40000000-0000-0000-0000-000000000002'
      AND entity_id = '40000000-0000-0000-0000-000000000010'
  ),
  1::bigint,
  'recommendation approval is audited'
);
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'recommendation_generated'
      AND entity_id = '40000000-0000-0000-0000-000000000010'
  ),
  1::bigint,
  'recommendation generation is audited'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
  $$UPDATE public.audit_events SET event_data = '{"tampered":true}'$$,
  '42501',
  NULL,
  'leaders cannot update audit history'
);
SELECT throws_ok(
  $$DELETE FROM public.audit_events$$,
  '42501',
  NULL,
  'leaders cannot delete audit history'
);

RESET ROLE;
SELECT is(
  (
    SELECT count(*)
    FROM public.audit_events
    WHERE event_type = 'availability_changed'
      AND entity_type = 'member_availability'
      AND entity_id != ''
  ),
  2::bigint,
  'audit events retain stable entity identities'
);

SELECT * FROM finish();
ROLLBACK;
