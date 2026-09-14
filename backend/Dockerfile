# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Dependencies come from the lockfile alone so this layer is reused whenever only
# source files change.
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# openssl is required by the Prisma query engine on the slim image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
# `tsx` and the Prisma CLI are runtime dependencies: migrations and the seed run inside
# this container on start, so they are part of the deployment path, not dev tooling.
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma

# Generated here rather than copied from the build stage: the query engine binary must
# match this image's platform and the client version actually installed above. Copying
# node_modules/.prisma across stages leaves the client unable to locate its engine.
RUN npx prisma generate

COPY --from=build /app/dist ./dist

# The seed imports the permission catalog from the domain layer so that the seeded
# matrix and the code enforcing it can never diverge. That makes `src` part of what the
# seed needs at runtime — a few hundred KB, and the alternative is duplicating the
# catalog into a second source of truth.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Strip CRLF in case the file was checked out on Windows without .gitattributes applied —
# a `/bin/sh^M` shebang would keep the container from starting at all.
RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
  && chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/storage \
  && chown -R node:node /app/storage

USER node
EXPOSE 3333

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main/server.js"]
