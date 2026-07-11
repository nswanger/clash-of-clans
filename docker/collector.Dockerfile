FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/collector/package.json apps/collector/tsconfig.json apps/collector/tsconfig.build.json ./apps/collector/
RUN pnpm install --frozen-lockfile
COPY apps/collector/src ./apps/collector/src
RUN pnpm --filter @cwl/collector exec tsc -p tsconfig.build.json

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TZ=America/New_York
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/collector/dist ./dist
USER node
HEALTHCHECK --interval=5m --timeout=15s --start-period=2m --retries=2 \
  CMD ["node", "dist/main.js", "--healthcheck"]
CMD ["node", "dist/main.js"]
