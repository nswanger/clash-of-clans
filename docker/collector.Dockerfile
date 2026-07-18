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
RUN pnpm --filter @cwl/collector exec esbuild src/main.ts \
    --bundle \
    --format=esm \
    --platform=node \
    --target=node22 \
    --outfile=dist/main.js

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TZ=America/New_York
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/collector/dist ./dist
USER node
HEALTHCHECK --interval=5m --timeout=15s --start-period=2m --retries=2 \
  CMD ["node", "dist/main.js", "--healthcheck"]
CMD ["node", "dist/main.js"]
