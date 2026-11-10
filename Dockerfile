# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS builder
WORKDIR /app
RUN mkdir -p /app /data/files && chown -R node:node /app /data
USER node
COPY --chown=node:node package.json package-lock.json .npmrc ./
COPY --chown=node:node scripts/docker-install.mjs scripts/docker-install.mjs
RUN --mount=type=secret,id=proxy_ca,required=false,uid=1000,gid=1000,mode=0400 node scripts/docker-install.mjs
COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1 ARCHIVE_STANDALONE=1
RUN npm run build

FROM builder AS tools
ENV NODE_ENV=production FILE_STORAGE_ROOT=/data/files
CMD ["node", "deploy/initialize.mjs"]

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 FILE_STORAGE_ROOT=/data/files
RUN mkdir -p /data/files && chown -R node:node /data /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/src/generated ./src/generated
COPY --from=builder --chown=node:node /app/scripts/isolated-file-worker.mjs ./scripts/isolated-file-worker.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--use-env-proxy", "server.js"]
