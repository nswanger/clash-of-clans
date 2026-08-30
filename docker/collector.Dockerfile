FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/collector/package.json apps/collector/tsconfig.json apps/collector/tsconfig.build.json ./apps/collector/
COPY packages/domain/package.json packages/domain/tsconfig.json ./packages/domain/
COPY packages/recommendations/package.json packages/recommendations/tsconfig.json ./packages/recommendations/
RUN pnpm install --frozen-lockfile
COPY apps/collector/src ./apps/collector/src
COPY packages/domain/src ./packages/domain/src
COPY packages/recommendations/src ./packages/recommendations/src
RUN pnpm --filter @cwl/collector exec tsc --noEmit
RUN pnpm --filter @cwl/collector exec esbuild src/main.ts src/supabase-auth.ts \
    --bundle \
    --format=esm \
    --platform=node \
    --target=node22 \
    --outdir=dist

# The migration versions present in the reviewed commit, recorded next to the bundle
# so the collector can tell at runtime whether the database is behind the schema this
# image needs (#81). The version is the leading digits of the filename, the same key
# the CLI stores in the ledger and scripts/check-migrations.sh compares against.
COPY supabase/migrations ./supabase/migrations
RUN node -e "const fs=require('node:fs');const versions=fs.readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).map(name=>name.match(/^([0-9]+)_/)?.[1]).filter(Boolean).sort();if(versions.length===0)throw new Error('no migrations found for the manifest');fs.writeFileSync('apps/collector/dist/migration-manifest.json',JSON.stringify(versions));console.log('migration manifest: '+versions.length+' versions through '+versions[versions.length-1]);"

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TZ=America/New_York
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/collector/dist ./dist
USER node
HEALTHCHECK --interval=5m --timeout=15s --start-period=2m --retries=2 \
  CMD ["node", "dist/main.js", "--healthcheck"]
CMD ["node", "dist/main.js"]
