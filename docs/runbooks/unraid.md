# UnRaid Collector Runbook

This runbook deploys one outbound-only `cwl-collector` container. The collector stores durable data in Supabase, so it needs no host data mount. Only deployment configuration lives under UnRaid app-data.

## Security boundary

- Keep `CLASH_API_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` only in `/mnt/user/appdata/cwl-collector/collector.env` with mode `600`.
- Never put collector secrets in GitHub Pages variables, Compose command lines, screenshots, support output, or git history.
- Do not publish a container port. The collector initiates HTTPS connections to Clash and Supabase; it does not accept inbound traffic.
- Keep the container unprivileged, non-root, read-only, capability-free, and protected with `no-new-privileges`.
- Use scoped `docker inspect --format ...` commands. A full container inspection includes environment values.

## Read-only preflight

The documented SSH target and app-data conventions live in `Personal-Vault/Server Docs`. Retrieve them there rather than copying private connection details into this repository.

Run these checks before any deployment write:

```sh
ssh <unraid-ssh-target> '
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

These commands change UnRaid and require explicit authorization. Set `UNRAID_SSH` locally to the documented SSH target.

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

   Verification must report a healthy container, successful Clash and Supabase connectivity, a recent raw snapshot, latest-season canonical war/member counts, a healthy latest collection, and zero duplicate canonical identities. `docker port` must print nothing.

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
