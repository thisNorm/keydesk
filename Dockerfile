# syntax=docker/dockerfile:1
FROM node:26.12.1-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true
COPY apps ./apps
COPY packages ./packages
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --offline --no-audit --no-fund

FROM node:26.12.1-bookworm-slim AS runtime
ENV NODE_ENV=production KEYDESK_HOST=0.0.0.0 KEYDESK_PORT=8088 KEYDESK_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node LICENSE ./LICENSE
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages ./packages
COPY --chown=node:node tools ./tools
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8088
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8088/api/status',{signal:AbortSignal.timeout(2000)}).then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(r=>{if(r.status!=='ok')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/server/src/main.ts"]
