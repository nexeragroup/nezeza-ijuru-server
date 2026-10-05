FROM node:24.21.0-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nest-cli.json tsconfig*.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build

FROM node:24.21.0-bookworm-slim AS runtime

WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune \
  && mkdir -p /app/storage \
  && chown node:node /app/storage

COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/run-migrations.cjs ./scripts/run-migrations.cjs

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/main.js"]
