# syntax=docker/dockerfile:1.18

# @spec spec://modules/distribution/INFRA-004-open-source-release#deployment
ARG NODE_IMAGE=node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.production.json ./
COPY src ./src
RUN pnpm build:production && pnpm prune --prod

ARG NODE_IMAGE=node:24.19.0-alpine3.24@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
FROM ${NODE_IMAGE} AS runtime
ARG AOP_VERSION=0.2.0-alpha
ARG AOP_REVISION=dev
ARG AOP_SOURCE=https://github.com/N1arko/agent-operator
ARG AOP_CREATED
LABEL org.opencontainers.image.title="Agent Operator Coordinator" \
      org.opencontainers.image.description="Self-hosted mailbox and presence coordinator for Codex agents" \
      org.opencontainers.image.version="${AOP_VERSION}" \
      org.opencontainers.image.revision="${AOP_REVISION}" \
      org.opencontainers.image.source="${AOP_SOURCE}" \
      org.opencontainers.image.created="${AOP_CREATED}" \
      org.opencontainers.image.licenses="Apache-2.0"
WORKDIR /app
ENV NODE_ENV=production \
    AOP_HOST=0.0.0.0 \
    AOP_PORT=8787 \
    AOP_DATA_DIR=/data \
    AOP_REVISION=${AOP_REVISION}
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY LICENSE ./
RUN rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/pnpm \
      /usr/local/bin/pnpx \
    && mkdir -p /data \
    && chown node:node /data
USER node
EXPOSE 8787
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/coordinator/main.js"]
