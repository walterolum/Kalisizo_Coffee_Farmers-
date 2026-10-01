# ---------------------------------------------------------------------------
# Stage 0: base
# ---------------------------------------------------------------------------
# Runtime packages installed exactly once and shared by every later stage.
#
# openssl is required by the Prisma query engine. curl backs the container
# healthcheck. Doing this in one place rather than repeating `apt-get` in three
# stages keeps a single layer cached and removes three separate network calls
# from the build, any one of which can fail on a flaky connection.
FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Stage 1: dependencies
# ---------------------------------------------------------------------------
# Installed from the lockfile alone so this layer is cached until a dependency
# actually changes. `npm ci` (not `npm install`) is what makes a deploy
# reproducible: it errors rather than silently resolving something new.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: build
# ---------------------------------------------------------------------------
# `prisma generate` must run before `next build`: the generated client is a build
# input, not a runtime step. It runs without a database connection.
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_SITE_URL is inlined into the client bundle at build time, so it
# must be present here, not only at runtime. Changing the domain means
# rebuilding the image.
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` imports route modules to collect page data, and
# `src/lib/auth.ts` evaluates its secret guard at module scope, throwing when
# NODE_ENV=production and JWT_SECRET is absent. So the build needs *a* value
# present.
#
# This is a fixed placeholder, not the real secret, and that is deliberate:
# baking the live JWT_SECRET into a build arg would put it in the image's layer
# history and in `docker inspect` output, where anyone who can pull or exec the
# image can read it. The real secret is injected at runtime by Compose, which
# overrides this value. `JWT_SECRET` is never referenced with a NEXT_PUBLIC_
# prefix, so it is not inlined into any client bundle.
ENV JWT_SECRET=build-time-placeholder-not-used-at-runtime

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runtime
# ---------------------------------------------------------------------------
# `output: "standalone"` produced a server bundle with only the traced
# dependencies, so node_modules is not copied wholesale.
FROM base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as a non-root user. The `node` user ships with the base image (uid 1000).
# The uploads volume is chowned to match, so an operator never needs to write as
# root on the host.
RUN mkdir -p /app/data/uploads \
 && chown -R node:node /app/data

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# The Prisma query engine and client live outside the traced bundle on some
# Prisma versions, and the query engine cannot load without them. Without these
# copies the app starts cleanly and then fails on the first query.
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER node

EXPOSE 3000

# Hits /api/v1/health, which verifies the app is serving *and* that it can reach
# PostgreSQL. `curl -f` turns a non-2xx into a non-zero exit, which is what the
# healthcheck reports on. Without the database check this would report healthy
# on an app that 500s on every page.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# Stage 4: migrate
# ---------------------------------------------------------------------------
# A separate target for a one-shot job, not for the long-running server.
#
# The runtime image has no Prisma CLI: `prisma` is a devDependency, so the
# standalone bundle never contained it. This stage builds on the full dependency
# tree from stage 1, which does have the CLI plus `tsx` for the seed script. Run
# it as `docker compose run --rm migrate`.
#
# Kept separate so the migration toolchain never ships in the runtime image, and
# so a failed migration cannot take the web process down with it.
FROM deps AS migrate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Schema and migrations, plus the seed script. `src/` is not needed: neither the
# CLI nor the seed reaches application code.
COPY prisma ./prisma

# `npm ci` installs the @prisma/client *package* but not the generated client,
# which is generated from the schema. Without this the CLI can still read the
# schema but the seed script dies on the first `new PrismaClient()` with
# "did not initialize yet". Needs no database connection.
RUN npx prisma generate

CMD ["npx", "prisma", "migrate", "deploy"]