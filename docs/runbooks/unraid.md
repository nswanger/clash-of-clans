# UnRaid Collector Runbook

This runbook deploys one outbound-only `cwl-collector` container. The collector stores durable data in Supabase, so it needs no host data mount. Only deployment configuration lives under UnRaid app-data.

## Security boundary

- Keep `CLASH_API_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` only in `/mnt/user/appdata/cwl-collector/collector.env` with mode `600`.
- Never put collector secrets in GitHub Pages variables, Compose command lines, screenshots, support output, or git history.
- Do not publish a container port. The collector initiates HTTPS connections to Clash and Supabase; it does not accept inbound traffic.
- Keep the container unprivileged, non-root, read-only, capability-free, and protected with `no-new-privileges`.
- Use scoped `docker inspect --format ...` commands. A full container inspection includes environment values.

## Read-only preflight

Every `ssh` and `scp` command below expects `UNRAID_SSH` in the environment. Load it from the gitignored local target file:

```sh
set -a; . deploy/unraid/target.env; set +a
```

Create that file from `deploy/unraid/target.env.example` on a machine that does not have it yet. `Personal-Vault/Server Docs/OS & Infrastructure/Network & Access.md` remains the source of truth for the host's SSH target, key setup, and network layout; `target.env` is a local convenience copy so a session does not have to go looking for it.

This repository is public. Keep host and account details in the gitignored file only, and never inline them into a committed command, log excerpt, or issue.

Run these checks before any deployment write:

```sh
ssh "$UNRAID_SSH" '
  uname -m
  date +%Z
  docker version --format "{{.Server.Version}}"
  docker compose version
  df -h /mnt/user/appdata
  test ! -e /mnt/user/appdata/cwl-collector
  test -z "$(docker ps -a --filter name=^/cwl-collector$ --format "{{.Names}}")"
  curl -fsS --max-time 10 https://api.ipify.org >/dev/null
  curl -fsS --max-time 10 -o /dev/null https://supabase.com
'
```

Sanitized preflight recorded on 2026-07-14:

- SSH succeeded; architecture is `x86_64`; timezone is `America/New_York`.
- Docker Server `29.5.1` and the Compose plugin are available.
- The app-data filesystem had approximately 159 GiB free.
- No `/mnt/user/appdata/cwl-collector` path or `cwl-collector` container conflict existed.
- Public-WAN lookup and outbound Supabase HTTPS succeeded. Clash HTTPS was reachable and returned the expected unauthenticated `403`.
- No remote files, images, networks, or containers were changed.

## Prepare the image locally

Build an immutable `linux/amd64` image from the reviewed commit. Do not use a floating tag for the first production deployment.

```sh
set -eu
commit_sha=$(git rev-parse --short=12 HEAD)
image="cwl-collector:$commit_sha"
build_context=$(mktemp -d)
trap 'rm -rf "$build_context"' EXIT HUP INT TERM
git archive HEAD | tar -x -C "$build_context"
docker buildx build --platform linux/amd64 --load \
  -f "$build_context/docker/collector.Dockerfile" \
  -t "$image" \
  "$build_context"
docker save "$image" | gzip > "/tmp/cwl-collector-$commit_sha.tar.gz"
```

The temporary build context comes only from the committed `HEAD` archive. Tracked modifications and untracked local files cannot enter an image tagged with the reviewed commit.

Record the image tag and source commit in the deployment handoff. If a registry is added later, use an immutable digest or commit tag and keep registry credentials outside this repository.

## SSH-assisted deployment

These commands change UnRaid and require explicit authorization. Load `UNRAID_SSH` as shown in the read-only preflight section.

1. Copy only the reviewed assets and image archive:

   ```sh
   ssh "$UNRAID_SSH" 'test ! -e /mnt/user/appdata/cwl-collector && install -d -m 700 /mnt/user/appdata/cwl-collector'
   scp deploy/unraid/docker-compose.yml \
     deploy/unraid/collector.env.example \
     scripts/verify-collector.sh \
     "/tmp/cwl-collector-$commit_sha.tar.gz" \
     "$UNRAID_SSH:/mnt/user/appdata/cwl-collector/"
   ```

   This create-only guard intentionally stops if the path appeared after preflight. For an upgrade, back up the existing selector and protected environment first; do not run the first-deployment commands over an existing directory.

2. From the same local shell where `commit_sha` was set, import the image and prepare protected configuration:

   ```sh
   ssh "$UNRAID_SSH" "cd /mnt/user/appdata/cwl-collector && \
     umask 077 && \
     gunzip -c 'cwl-collector-$commit_sha.tar.gz' | docker load && \
     install -m 600 collector.env.example collector.env && \
     printf 'COLLECTOR_IMAGE=cwl-collector:%s\\n' '$commit_sha' > .env && \
     chmod 700 verify-collector.sh && \
     chmod 600 collector.env .env"
   ssh -t "$UNRAID_SSH" 'vi /mnt/user/appdata/cwl-collector/collector.env'
   ```

   Quote `CLAN_TAG` in the env file because its value begins with `#`. Required values are `CLASH_API_TOKEN`, `CLAN_TAG`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TZ`.

   Optional values:

   - `LOG_LEVEL=error` or `silent`; default `error`.
   - `ACTIVE_CWL_INTERVAL_MINUTES`; positive integer, default `60`.
   - `IDLE_INTERVAL_HOURS`; positive integer, default `24`.
   - `REGULAR_WAR_INTERVAL_HOURS`; positive integer, default `6`, used while
     a regular war is active when CWL is not active.

3. Validate the rendered service shape without displaying secret values, then start it:

   ```sh
   docker compose config --services
   docker compose config --images
   docker compose up -d
   ```

4. Wait through the health start period and verify:

   ```sh
   ./verify-collector.sh
   docker port cwl-collector
   ```

   Verification must report a healthy container, successful Clash and Supabase connectivity, a recent raw snapshot, latest-season canonical war/member counts, and zero duplicate canonical identities. The latest collection must be `healthy`, except that `partial` is accepted and remains visible when the only failed attempt is the current CWL league-group endpoint returning `404 not_found`, the clan and member attempts are healthy, and complete, unique healthy player attempts match the live clan member count. `docker port` must print nothing.

## Upgrade an existing deployment

Use this section when `/mnt/user/appdata/cwl-collector` already exists. The first-deployment commands above stop on their create-only guard and must not be run over an existing directory. An upgrade replaces the image and the non-secret assets only; the protected `collector.env` is never overwritten by this procedure.

Apply any database migrations the new commit requires **before** starting the new image. A collector that calls a database function the remote schema does not have will fail its normalized writes while still reporting healthy Clash attempts. Confirm with `supabase migration list` that every local migration has a matching remote entry.

1. Record the current image and back up the non-secret selector and the protected environment. Copy the environment file rather than displaying it; its values are secrets.

   ```sh
   cd /mnt/user/appdata/cwl-collector
   stamp=$(date +%Y%m%d%H%M%S)
   docker inspect --format '{{.Config.Image}}' cwl-collector
   cp .env ".env.rollback-$stamp"
   cp collector.env "collector.env.backup-$stamp"
   chmod 600 "collector.env.backup-$stamp"
   ls -1a | grep -- "$stamp"
   ./verify-collector.sh | grep -E '^(Collection run|Collection health):' || true
   ```

   Record the printed image name in the deployment handoff. It is the rollback target. Both backups must appear in the listing. Use `ls -1a`, not `ls -1`: the selector backup is a dotfile and a plain listing silently omits it, which reads as a failed backup.

   Record the baseline collection-run ID too. Step 5 needs it to tell a new run from the pre-upgrade one, and a baseline that is already unhealthy tells you the existing deployment was broken before this upgrade touched it.

2. From the local shell where `commit_sha` was set, copy the new image archive and the reviewed non-secret assets. `collector.env.example` is a template only and does not affect the running configuration.

   ```sh
   scp deploy/unraid/docker-compose.yml \
     deploy/unraid/collector.env.example \
     scripts/verify-collector.sh \
     "/tmp/cwl-collector-$commit_sha.tar.gz" \
     "$UNRAID_SSH:/mnt/user/appdata/cwl-collector/"
   ```

3. Import the image and reconcile new optional configuration keys. Compare key names only so no secret value is printed.

   ```sh
   ssh "$UNRAID_SSH" "cd /mnt/user/appdata/cwl-collector && \
     umask 077 && \
     gunzip -c 'cwl-collector-$commit_sha.tar.gz' | docker load && \
     chmod 700 verify-collector.sh && \
     comm -23 \
       <(grep -oE '^[A-Z_]+=' collector.env.example | tr -d '=' | sort) \
       <(grep -oE '^[A-Z_]+=' collector.env | tr -d '=' | sort)"
   ```

   The `comm` output lists keys present in the new template but absent from the live environment. Every key it prints must be either optional with an acceptable default or added by hand with `vi collector.env`. An empty result means no configuration change is required. Required keys are `CLASH_API_TOKEN`, `CLAN_TAG`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `TZ`; the remaining documented keys are optional and defaulted.

4. Point the Compose selector at the new immutable tag and recreate only the collector service. Do not run `docker compose down`, and never `docker compose down -v`.

   ```sh
   ssh "$UNRAID_SSH" "cd /mnt/user/appdata/cwl-collector && \
     printf 'COLLECTOR_IMAGE=cwl-collector:%s\\n' '$commit_sha' > .env && \
     chmod 600 .env && \
     docker compose config --images && \
     docker compose up -d --force-recreate collector"
   ```

   `docker compose config --images` must print the new tag before the service is recreated.

5. Wait for the new image to finish a collection, then verify against the same criteria as a first deployment:

   ```sh
   ssh "$UNRAID_SSH" 'cd /mnt/user/appdata/cwl-collector && ./verify-collector.sh && docker port cwl-collector'
   ```

   Container health is not a sufficient signal here. Health turns `healthy` about fifteen seconds after recreation, well before a full collection completes, and `verify-collector.sh` reports the most recent *completed* run. Verifying too early reports the pre-upgrade run and can pass or fail on evidence the new image never produced.

   Compare the reported `Collection run` against the baseline from step 1. While they match, the new image has not finished its first collection; wait and re-run rather than acting on the result. Once the ID differs, apply the acceptance rules from the first-deployment verification step. `docker port` must print nothing.

6. Confirm the upgrade actually changed collector behavior rather than only the tag. Check that the endpoints the new commit introduces appear in `collection_attempts` after the next scheduled run, and that the recorded image matches the intended commit:

   ```sh
   ssh "$UNRAID_SSH" "docker inspect --format '{{.Config.Image}}' cwl-collector"
   ```

   A tag that changed while the expected new endpoints never appear means the image was built from the wrong commit. Rebuild from the reviewed commit rather than editing the container.

If verification fails, diagnose it with the section below before rolling back. If the cause is the new image, roll back with the recorded prior image tag using the Rollback section. Restore the protected environment from `collector.env.backup-$stamp` only if step 3 modified it.

### Diagnose a failed upgrade verification

A verification failure after an upgrade does not by itself mean the upgrade caused it. Establish which before rolling back, because rolling back a pre-existing defect restores the same failure under an older tag.

A failed normalized write presents as a *healthy* Clash attempt. The endpoint records HTTP 200 with `normalization_error`, and every attempt that depends on it is skipped, so one broken endpoint empties most of a run while connectivity looks fine. Container logs will not explain it: the collector collects internal normalization errors but does not surface them (issue [#9](https://github.com/nswanger/clash-of-clans/issues/9)).

1. Read the failing run's attempts to find which endpoint broke and how. Query `collection_attempts` filtered to the failing `run_id`, selecting `endpoint`, `status`, `http_status`, and `error_category` — the same fields `verify-collector.sh` reads. An endpoint with `http_status` 200 and a normalization error is the origin; the skipped attempts downstream of it are consequences, not separate faults.

2. Replay that endpoint's RPC directly against the database with the payload the collector sent. The database returns the real error where the collector reports only `normalization_error` — for example a `23514` check-constraint violation naming the constraint and the failing row. This is the only way to see the underlying cause today.

3. Decide whether the new commit introduced it, by diffing the affected code path between the two image commits:

   ```sh
   git diff <previous-commit>..<new-commit> -- apps/collector/src/<affected-file>.ts
   ```

   No change in that path means the new image did not introduce the defect. A latent defect that live data only just began to trigger looks exactly like an upgrade regression, and rolling back will not fix it. Roll forward with a targeted fix and a regression test instead.

Do not use the production SQL Editor to patch data or schema while diagnosing. Schema changes belong in a migration.

## Public WAN IP and Clash key

Clash API keys are managed in the official [Clash of Clans developer portal](https://developer.clashofclans.com/). Immediately before deployment, obtain the current public egress address from UnRaid:

```sh
curl -fsS https://api.ipify.org
printf '\n'
```

Compare that address with the IP configured for the server-side Clash key. Update the portal if needed, but do not paste the token or WAN IP into this repository. A `403` from the authenticated clan request in `verify-collector.sh` usually means the key, key IP, or token permissions need correction; rotate an exposed token rather than reusing it.

## UnRaid UI fallback

If Compose is not used, import the same immutable image and create one container with these settings:

| Field | Value |
| --- | --- |
| Name | `cwl-collector` |
| Repository/image | `cwl-collector:<commit-sha>` |
| Network | Bridge; outbound access only |
| Restart policy | Unless stopped |
| Privileged | Off |
| User | `1000:1000` |
| Ports | None |
| Paths/volumes | None |
| Read-only root | On |
| Capabilities | Drop all |
| Security option | `no-new-privileges:true` |
| Tmpfs | `/tmp`, 16 MiB, `noexec,nosuid` |
| Health command | `node dist/main.js --healthcheck` |

Add the five required environment variables and any reviewed optional overrides as protected variables. Do not use a WebUI URL or port mapping. Copy `verify-collector.sh` to the protected app-data directory and run it from an UnRaid terminal after the first collection.

## Retry idempotency check

Perform this only after the first healthy collection. The test restarts the collector twice so each startup performs a fresh leased collection against the same latest API state.

1. Run `./verify-collector.sh` and record the completed collection-run ID and start time, latest raw timestamp, canonical war count, canonical member count, collection health, and duplicate count.
2. Run `docker restart cwl-collector`, wait for health to return to `healthy`, then run `./verify-collector.sh` again.
3. Repeat step 2 once more without changing the API or environment configuration.
4. Confirm each restart produced a different completed collection-run ID, canonical war/member counts did not inflate, and duplicate canonical identities remain `0`. If the live Clash response legitimately changed during the test, investigate the count delta rather than treating every delta as inflation. Identical raw response fingerprints may be deduplicated.

If counts inflate or duplicates appear, stop the collector and preserve the sanitized verification output for diagnosis. Do not delete or hand-edit Supabase rows.

## Rollback

Before changing an existing deployment, record only the current image name and back up the non-secret Compose selector:

```sh
cd /mnt/user/appdata/cwl-collector
docker inspect --format '{{.Config.Image}}' cwl-collector
cp .env ".env.rollback-$(date +%Y%m%d%H%M%S)"
```

To roll back, set `COLLECTOR_IMAGE` in `.env` to the prior immutable image tag and recreate only this service:

```sh
docker compose stop collector
docker compose up -d --force-recreate collector
./verify-collector.sh
docker port cwl-collector
```

This stops and replaces only the collector container. It does not delete Supabase data. Do not run `docker compose down -v`, database resets, or destructive SQL during rollback. If the previous deployment used the UnRaid UI, restore its saved template/image tag and start it after stopping the new container.

For a first deployment with no prior collector image or configuration, the rollback is to stop only the new service:

```sh
docker compose stop collector
docker inspect --format '{{.State.Status}}' cwl-collector
```

The expected state is `exited`. Supabase data and the protected deployment directory remain intact. To complete the rollback drill without changing configuration, restart the same immutable deployment with `docker compose up -d collector`, wait for health, rerun `./verify-collector.sh`, and confirm the canonical counts and duplicate result are unchanged.
