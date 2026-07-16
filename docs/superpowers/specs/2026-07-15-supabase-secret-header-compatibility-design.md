# Supabase Secret Header Compatibility Design

## Context

The collector currently sends `SUPABASE_SERVICE_ROLE_KEY` in both the `apikey` and `Authorization: Bearer` headers. That works for the legacy JWT-based `service_role` key, but a current `sb_secret_...` key is an API key rather than a JWT and must not be used as a bearer token.

The environment variable name remains `SUPABASE_SERVICE_ROLE_KEY` to avoid changing the existing Compose and deployment contract. Its value may be either a current `sb_secret_...` server secret or a legacy JWT-based `service_role` key.

## Decision

Build Supabase REST headers according to the credential format:

| Credential | `apikey` | `Authorization` |
| --- | --- | --- |
| Current `sb_secret_...` server secret | Include | Omit |
| Legacy JWT-based `service_role` key | Include | `Bearer <key>` |

Reject browser publishable keys, Supabase personal access tokens, placeholders, and unrecognized values during collector configuration. The error must identify the invalid environment variable and expected key types without logging any credential value.

## Implementation Boundaries

- Add a small pure helper for building Supabase request headers so behavior can be tested without starting the collector.
- Use the helper for every collector request to `/rest/v1` and RPC endpoints.
- Extend configuration validation without renaming environment variables or changing the UnRaid Compose contract.
- Update deployment guidance to state that `SUPABASE_SERVICE_ROLE_KEY` should contain a current `sb_secret_...` server secret.
- Do not add Supabase client dependencies, expose secrets, change database schema, or perform remote writes as part of this patch.

## Error Handling and Security

- Configuration fails before any network request when the server credential format is invalid.
- Error messages and tests use synthetic credentials only.
- No validation output may include credential contents, prefixes beyond documented key-type names, or partial secret values.
- The root `.env` remains local and ignored. Production Compose reads `collector.env` from the protected UnRaid app-data directory rather than the repository root `.env`.

## Testing

Use test-driven development to cover:

1. A current `sb_secret_...` key produces `apikey` without `Authorization`.
2. A legacy JWT-shaped `service_role` key produces both headers.
3. Configuration accepts both supported server credential formats.
4. Configuration rejects a browser `sb_publishable_...` key and other unrecognized formats without echoing the supplied value.
5. The collector test suite, workspace typecheck, workspace build, and repository diff checks pass.

After the local patch passes, use the corrected production variables for read-only Supabase and Clash connectivity checks before requesting authorization for UnRaid deployment writes.
