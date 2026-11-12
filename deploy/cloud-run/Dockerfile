# syntax=docker/dockerfile:1
FROM aleteam-cloud-tools:build AS snapshot
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 postgresql-client-15 && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node deploy/cloud-run /app/deploy/cloud-run
USER node
RUN node deploy/cloud-run/bundle.mjs && ALE_PREPARE_ONLY=1 node deploy/cloud-run/start.mjs && node deploy/cloud-run/package-runtime.mjs

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
USER root
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 postgresql-client-15 && rm -rf /var/lib/apt/lists/* && mkdir -p /app && chown node:node /app
WORKDIR /app
COPY --from=snapshot --chown=node:node /app/.cloud-runtime ./
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0 ARCHIVE_CONTENT_MODE=real ALLOW_DEMO_SEED=0
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","deploy/cloud-run/start.mjs"]
