# syntax=docker/dockerfile:1
FROM aleteam-cloud-tools:build AS snapshot
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 postgresql-client-15 && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node deploy/cloud-run /app/deploy/cloud-run
USER node
RUN node deploy/cloud-run/bundle.mjs && ALE_PREPARE_ONLY=1 node deploy/cloud-run/start.mjs

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 postgresql-client-15 && rm -rf /var/lib/apt/lists/* && mkdir -p /app && chown node:node /app
WORKDIR /app
COPY --from=snapshot --chown=node:node /app/.next/standalone ./
COPY --from=snapshot --chown=node:node /app/.next/static ./.next/static
COPY --from=snapshot --chown=node:node /app/public ./public
COPY --from=snapshot --chown=node:node /app/src/generated ./src/generated
COPY --from=snapshot --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=snapshot --chown=node:node /app/node_modules/@prisma/client-runtime-utils ./node_modules/@prisma/client-runtime-utils
COPY --from=snapshot --chown=node:node /app/scripts/isolated-file-worker.mjs ./scripts/isolated-file-worker.mjs
COPY --from=snapshot --chown=node:node /app/.cloud-preview-seed ./.cloud-preview-seed
COPY --from=snapshot --chown=node:node /app/deploy/cloud-run/start.mjs ./deploy/cloud-run/start.mjs
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 ARCHIVE_CONTENT_MODE=real ALLOW_DEMO_SEED=0
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","deploy/cloud-run/start.mjs"]
