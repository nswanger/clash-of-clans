CREATE OR REPLACE FUNCTION public.audit_invitation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_events (
            actor_id,
            event_type,
            entity_type,
            entity_id,
            event_data
        )
        VALUES (
            new.created_by,
            'invitation_created',
            'invitation',
            new.id::text,
            jsonb_build_object('expiresAt', new.expires_at)
        );
    ELSIF old.used_by IS NULL AND new.used_by IS NOT NULL THEN
        INSERT INTO public.audit_events (
            actor_id,
            event_type,
            entity_type,
            entity_id,
            event_data
        )
        VALUES (
            new.used_by,
            'invitation_redeemed',
            'invitation',
            new.id::text,
            '{}'::jsonb
        );
    END IF;
    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    changed_role public.user_roles%ROWTYPE;
BEGIN
    changed_role := CASE WHEN TG_OP = 'DELETE' THEN old ELSE new END;
    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        auth.uid(),
        CASE WHEN TG_OP = 'DELETE' THEN 'role_revoked' ELSE 'role_granted' END,
        'user_role',
        changed_role.user_id::text || ':' || changed_role.role::text,
        jsonb_build_object(
            'userId', changed_role.user_id,
            'role', changed_role.role
        )
    );
    RETURN changed_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_availability_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        new.recorded_by,
        'availability_changed',
        'member_availability',
        new.id::text,
        jsonb_build_object(
            'clanTag', new.clan_tag,
            'seasonId', new.season_id,
            'playerTag', new.player_tag,
            'status', new.status
        )
    );
    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_leader_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        new.actor_id,
        'recommendation_' || new.status::text,
        'recommendation',
        new.recommendation_id::text,
        jsonb_build_object(
            'decisionId', new.id,
            'status', new.status
        )
    );
    RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_recommendation_generation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.audit_events (
        actor_id,
        event_type,
        entity_type,
        entity_id,
        event_data
    )
    VALUES (
        new.proposed_by,
        'recommendation_generated',
        'recommendation',
        new.id::text,
        jsonb_strip_nulls(jsonb_build_object(
            'source', new.source,
            'strategyVersion', new.strategy_version,
            'seasonId', new.season_id,
            'warTag', new.war_tag
        ))
    );
    RETURN new;
END;
$$;

CREATE TRIGGER audit_invitation_after_insert
AFTER INSERT ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.audit_invitation_change();

CREATE TRIGGER audit_invitation_after_redemption
AFTER UPDATE OF used_at, used_by ON public.invitations
FOR EACH ROW
EXECUTE FUNCTION public.audit_invitation_change();

CREATE TRIGGER audit_role_after_change
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.audit_role_change();

CREATE TRIGGER audit_availability_after_change
AFTER INSERT OR UPDATE ON public.member_availability
FOR EACH ROW
EXECUTE FUNCTION public.audit_availability_change();

CREATE TRIGGER audit_leader_decision_after_insert
AFTER INSERT ON public.leader_decisions
FOR EACH ROW
EXECUTE FUNCTION public.audit_leader_decision();

CREATE TRIGGER audit_recommendation_after_insert
AFTER INSERT ON public.recommendations
FOR EACH ROW
EXECUTE FUNCTION public.audit_recommendation_generation();

REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM authenticated, service_role;

COMMENT ON FUNCTION public.audit_invitation_change() IS
    'Appends invitation lifecycle events without recording invitation tokens or hashes.';
COMMENT ON FUNCTION public.audit_availability_change() IS
    'Appends availability changes without copying free-form member notes.';
