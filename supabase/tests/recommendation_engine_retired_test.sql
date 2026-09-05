BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(9);

-- ADR 0026: the engine, its storage, and the decision record against it are gone.
SELECT hasnt_table('public', 'recommendations', 'recommendations table is retired');
SELECT hasnt_table('public', 'leader_decisions', 'leader decisions table is retired');
SELECT hasnt_type('public', 'recommendation_status', 'recommendation status type is retired');
SELECT hasnt_type('public', 'decision_status', 'decision status type is retired');
SELECT hasnt_function('public', 'get_recommendation_context', ARRAY['text'], 'context reader is retired');
SELECT hasnt_function('public', 'persist_recommendation', 'proposal writer is retired');
SELECT hasnt_function('public', 'record_leader_decision', 'decision writer is retired');
SELECT hasnt_function('public', 'audit_recommendation_generation', 'generation audit trigger function is retired');

-- The audit trail itself is untouched: rows the retired triggers wrote stay readable.
SELECT has_table('public', 'audit_events', 'audit events remain');

SELECT * FROM finish();
ROLLBACK;
