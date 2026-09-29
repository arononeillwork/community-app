# syntax=docker/dockerfile:1
#
# Production image for the Next.js app (output: "standalone" in next.config.ts).
# Supabase is NOT inside this image: locally it runs as separate containers
# started by the Supabase CLI (`npm run db:start`); in production it is a
# hosted Supabase project.
#
# Build + run locally:  npm run docker:up   (see docker-compose.yml)

ARG NODE_VERSION=22

# ---------------------------------------------------------------- 1. deps
# Install exactly what package-lock.json says. Cached until the lockfile changes.
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- 2. builder
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app

# NEXT_PUBLIC_* values are inlined into the JavaScript at build time, so they
# must be known here (docker-compose.yml passes them from .env.docker).
# Server-only secrets (SUPABASE_SERVICE_ROLE_KEY) are NOT build args: they are
# given to the running container, so they never end up in an image layer.
ARG NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN if [ -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" ]; then \
      echo "NEXT_PUBLIC_SUPABASE_ANON_KEY is empty. Build with: npm run docker:up (it reads .env.docker)." >&2; \
      exit 1; \
    fi

# Type errors still fail the build. ESLint runs separately in `npm run check`,
# so a lint warning in one page does not block building the image.
RUN npx next build --no-lint

# ---------------------------------------------------------------- 3. runner
FROM node:${NODE_VERSION}-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user, never as root.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs --no-create-home nextjs

# The standalone output is a minimal server.js plus only the node_modules it
# needs. Static assets and public/ are not included in it, so copy them too.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
