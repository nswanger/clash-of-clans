BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(15);

SELECT has_column('public', 'recommendations', 'input_hash', 'recommendations store deterministic input hashes');
SELECT has_column('public', 'recommendations', 'source', 'recommendations record their generation source');
SELECT has_function(
  'public',
  'get_recommendation_context',
  ARRAY['text'],
  'canonical recommendation context function exists'
);
SELECT has_function(
  'public',
  'persist_recommendation',
  ARRAY['text', 'text', 'text', 'text', 'jsonb', 'jsonb', 'text'],
  'idempotent recommendation writer exists'
);

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
    '30000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'recommendation-leader@example.test',
    'x',
    now(),
    '{}',
    '{"name":"Recommendation Leader"}'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'recommendation-outsider@example.test',
    'x',
    now(),
    '{}',
    '{"name":"Recommendation Outsider"}'
  );

INSERT INTO public.user_roles (user_id, role)
VALUES ('30000000-0000-0000-0000-000000000001', 'leader');

INSERT INTO public.cwl_seasons (
  clan_tag,
  season_id,
  war_size,
  target_core_size,
  rotation_positions
)
VALUES ('#RECOMMEND', '2026-07', 15, 10, 5);

INSERT INTO public.cwl_members (
  clan_tag,
  season_id,
  player_tag,
  name,
  town_hall_level
)
VALUES
  ('#RECOMMEND', '2026-07', '#OUT', 'Outgoing', 17),
  ('#RECOMMEND', '2026-07', '#IN', 'Incoming', 17);

INSERT INTO public.cwl_wars (
  war_tag,
  clan_tag,
  season_id,
  war_day,
  state
)
VALUES ('#RECOMMENDWAR', '#RECOMMEND', '2026-07', 1, 'inWar');

INSERT INTO public.cwl_war_members (
  war_tag,
  player_tag,
  map_position,
  town_hall_level,
  assigned_attacks
)
VALUES ('#RECOMMENDWAR', '#OUT', 1, 17, 1);

INSERT INTO public.collection_runs (
  id,
  status,
  started_at,
  finished_at,
  last_fresh_at
)
VALUES (
  '30000000-0000-0000-0000-000000000010',
  'healthy',
  now() - INTERVAL '2 minutes',
  now() - INTERVAL '1 minute',
  now() - INTERVAL '1 minute'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

CREATE TEMPORARY TABLE recommendation_context AS
SELECT public.get_recommendation_context('#RECOMMEND') AS value;

SELECT isnt(
  (SELECT recommendation_context.value FROM recommendation_context),
  NULL,
  'leader receives a canonical context when a normalized lineup exists'
);
SELECT is(
  (SELECT recommendation_context.value ->> 'warTag' FROM recommendation_context),
  '#RECOMMENDWAR',
  'context targets the latest normalized lineup'
);

CREATE TEMPORARY TABLE first_recommendation AS
SELECT *
FROM public.persist_recommendation(
  '#RECOMMEND',
  '2026-07',
  '#RECOMMENDWAR',
  'ordered-rules-v1',
  '{"schemaVersion":1,"sourceCollectionRunId":"run-1","latestAvailabilityAt":"2026-07-18T17:00:00Z","context":{"revision":1,"collectionHealth":{"status":"healthy","collectedAt":"2026-07-18T16:55:00Z"}}}',
  '{"strategyVersion":"ordered-rules-v1","changes":[]}',
  'manual'
);

SELECT is(
  (SELECT first_recommendation.created FROM first_recommendation),
  true,
  'first input creates a recommendation'
);

CREATE TEMPORARY TABLE duplicate_recommendation AS
SELECT *
FROM public.persist_recommendation(
  '#RECOMMEND',
  '2026-07',
  '#RECOMMENDWAR',
  'ordered-rules-v1',
  '{"schemaVersion":1,"sourceCollectionRunId":"run-1","latestAvailabilityAt":"2026-07-18T17:00:00Z","context":{"revision":1,"collectionHealth":{"status":"healthy","collectedAt":"2026-07-18T16:55:00Z"}}}',
  '{"strategyVersion":"ordered-rules-v1","changes":[]}',
  'manual'
);

SELECT is(
  (SELECT duplicate_recommendation.recommendation_id FROM duplicate_recommendation),
  (SELECT first_recommendation.recommendation_id FROM first_recommendation),
  'identical inputs resolve to the existing recommendation'
);
SELECT is(
  (SELECT count(*) FROM public.recommendations WHERE clan_tag = '#RECOMMEND'),
  1::bigint,
  'identical inputs do not duplicate recommendations'
);

CREATE TEMPORARY TABLE freshness_only_recommendation AS
SELECT *
FROM public.persist_recommendation(
  '#RECOMMEND',
  '2026-07',
  '#RECOMMENDWAR',
  'ordered-rules-v1',
  '{"schemaVersion":1,"sourceCollectionRunId":"run-2","latestAvailabilityAt":"2026-07-18T18:00:00Z","context":{"revision":1,"collectionHealth":{"status":"healthy","collectedAt":"2026-07-18T17:55:00Z"}}}',
  '{"strategyVersion":"ordered-rules-v1","changes":[]}',
  'collection'
);

SELECT is(
  (SELECT freshness_only_recommendation.recommendation_id FROM freshness_only_recommendation),
  (SELECT first_recommendation.recommendation_id FROM first_recommendation),
  'freshness-only metadata does not create a duplicate proposal'
);

CREATE TEMPORARY TABLE changed_recommendation AS
SELECT *
FROM public.persist_recommendation(
  '#RECOMMEND',
  '2026-07',
  '#RECOMMENDWAR',
  'ordered-rules-v1',
  '{"schemaVersion":1,"sourceCollectionRunId":"run-3","context":{"revision":2,"collectionHealth":{"status":"healthy","collectedAt":"2026-07-18T18:55:00Z"}}}',
  '{"strategyVersion":"ordered-rules-v1","changes":[]}',
  'manual'
);

SELECT is(
  (SELECT changed_recommendation.created FROM changed_recommendation),
  true,
  'changed inputs create a new recommendation'
);
SELECT is(
  (
    SELECT public.recommendations.status::text
    FROM public.recommendations
    WHERE public.recommendations.id = (SELECT first_recommendation.recommendation_id FROM first_recommendation)
  ),
  'superseded',
  'a changed input supersedes the prior proposal'
);
SELECT is(
  (
    SELECT public.recommendations.status::text
    FROM public.recommendations
    WHERE public.recommendations.id = (SELECT changed_recommendation.recommendation_id FROM changed_recommendation)
  ),
  'proposed',
  'the changed input remains available for leader review'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT throws_ok(
  $$SELECT public.get_recommendation_context('#RECOMMEND')$$,
  '42501',
  'Leader access required',
  'authenticated outsiders cannot request recommendation context'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT isnt(
  public.get_recommendation_context('#RECOMMEND'),
  NULL,
  'the server-only collector role can derive recommendations'
);

SELECT * FROM finish();
ROLLBACK;
