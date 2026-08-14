# syntax=docker/dockerfile:1.7

FROM node:22.22.0-alpine3.22 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/embratel-relay/package.json apps/embratel-relay/package.json
COPY packages/bus/package.json packages/bus/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/transport/package.json packages/transport/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS build
ARG NEXT_PUBLIC_API_URL=https://api.comunora.com.br
ARG NEXT_PUBLIC_APP_URL=https://app.comunora.com.br
ARG NEXT_PUBLIC_SITE_URL=https://comunora.com.br
ARG NEXT_PUBLIC_DOCS_URL=https://docs.comunora.com.br
ARG NEXT_PUBLIC_STATUS_URL=https://status.comunora.com.br
ARG NEXT_PUBLIC_BRAND_NAME=Comunora
ARG NEXT_PUBLIC_SUPPORT_EMAIL=suporte@comunora.com.br
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_STANDALONE=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL
ENV NEXT_PUBLIC_STATUS_URL=$NEXT_PUBLIC_STATUS_URL
ENV NEXT_PUBLIC_BRAND_NAME=$NEXT_PUBLIC_BRAND_NAME
ENV NEXT_PUBLIC_SUPPORT_EMAIL=$NEXT_PUBLIC_SUPPORT_EMAIL
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm build

FROM build AS api-production
RUN pnpm --filter @plataforma/api deploy --prod --legacy /prod/api

FROM build AS worker-production
RUN pnpm --filter @plataforma/worker deploy --prod --legacy /prod/worker

FROM node:22.22.0-alpine3.22 AS migration-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk upgrade --no-cache

FROM node:22.22.0-alpine3.22 AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-*
USER node

FROM node-runtime AS api
COPY --from=api-production --chown=node:node /prod/api ./
EXPOSE 3000
CMD ["dist/main.js"]

FROM node-runtime AS worker
COPY --from=worker-production --chown=node:node /prod/worker ./
CMD ["dist/main.js"]

FROM migration-runtime AS migration
RUN npm install --global pnpm@10.34.5 && npm cache clean --force
COPY --from=build /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages ./packages
USER node
CMD ["pnpm", "--filter", "@plataforma/db", "migrate"]

FROM node-runtime AS web
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
EXPOSE 3001
CMD ["apps/web/server.js"]

FROM node-runtime AS relay
COPY --from=build --chown=node:node /workspace/apps/embratel-relay ./apps/embratel-relay
EXPOSE 8788
CMD ["apps/embratel-relay/server.js"]
