# Host-neutral image: Cloud Run, Firebase App Hosting, Kubernetes, or a single VM.
# Node is pinned to the major the platform is built and tested on (see .nvmrc).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The public origin has to be present at BUILD time, not only at runtime: it is
# inlined into the browser bundle. An image built without it carries whatever
# the fallback happens to be, and the wrong origin in a client bundle is silent
# — links look right in the markup and go to the wrong host.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# The commit this image was built from. The service worker's cache version is
# stamped with it, which is what lets a browser notice that a new build exists:
# a worker whose bytes never change is never reinstalled, and its cache is never
# cleared.
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}
# A build must not reach a real database; the embedded one is used for prerendering.
ENV NODE_ENV=production
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# Writable only where it has to be: uploads and, absent DATABASE_URL, the embedded database.
RUN useradd --system --uid 10001 --home /app appuser \
 && mkdir -p /data && chown -R appuser:appuser /app /data
COPY --from=build --chown=appuser:appuser /app/.next/standalone ./
COPY --from=build --chown=appuser:appuser /app/.next/static ./.next/static
COPY --from=build --chown=appuser:appuser /app/public ./public
COPY --from=build --chown=appuser:appuser /app/drizzle ./drizzle
COPY --from=build --chown=appuser:appuser /app/content ./content
USER appuser
EXPOSE 8080
# /system/ready, never /system/health. Health reports whether the PROGRAMME is
# ready to see citizens — an escalation channel with a provider, a review board
# with its quorum, a signed clinical corpus — and returns 503 until all three
# are arranged, which is done by operating the platform. A liveness probe on it
# therefore shuts down a container that is working perfectly, over and over,
# because the board has not been appointed yet. /system/ready answers the
# question a probe is entitled to ask: can this container serve a request.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/system/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
