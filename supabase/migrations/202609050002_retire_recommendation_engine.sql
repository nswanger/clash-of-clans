-- Retire the recommendation engine (ADR 0026, #111).
--
-- ADR 0002 removed the only reader of machine recommendations and the
-- approve/override controls; the pipeline kept writing a proposal on every
-- active-CWL collection that nothing read. The lineup workspace applies the
-- same rules live where the leader is deciding, so the stored proposals, the
-- leader decisions recorded against them, and the functions that produced
-- them are dropped. `audit_events` rows already written by the triggers below
-- stay: they are the operational trail, and they do not reference these tables.

DROP TRIGGER IF EXISTS audit_recommendation_after_insert ON public.recommendations;
DROP TRIGGER IF EXISTS audit_leader_decision_after_insert ON public.leader_decisions;
DROP TRIGGER IF EXISTS set_recommendation_input_hash_before_write ON public.recommendations;

DROP FUNCTION IF EXISTS public.audit_recommendation_generation();
DROP FUNCTION IF EXISTS public.audit_leader_decision();
DROP FUNCTION IF EXISTS public.record_leader_decision(uuid, public.decision_status, jsonb, text);
DROP FUNCTION IF EXISTS public.persist_recommendation(text, text, text, text, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.get_recommendation_context(text);
DROP FUNCTION IF EXISTS public.set_recommendation_input_hash();
DROP FUNCTION IF EXISTS public.recommendation_input_hash(jsonb);

DROP TABLE IF EXISTS public.leader_decisions;
DROP TABLE IF EXISTS public.recommendations;

DROP TYPE IF EXISTS public.decision_status;
DROP TYPE IF EXISTS public.recommendation_status;
