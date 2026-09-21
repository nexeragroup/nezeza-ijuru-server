# syntax=docker/dockerfile:1.7

FROM node:24.15-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml nest-cli.json tsconfig*.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm run build

FROM node:24.15-bookworm-slim AS runtime

ARG NODE_ENV=production

ENV NODE_ENV=${NODE_ENV} \
    HOST=0.0.0.0 \
    PORT=3000

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/ready').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "dist/main.js"]
