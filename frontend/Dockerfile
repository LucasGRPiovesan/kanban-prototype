# syntax=docker/dockerfile:1
#
# Built from the *repository root* (see docker-compose.yml's `web.build.context`), not
# from frontend/ alone: the Documentação module reads ../docs/*.md and ../README.md as
# raw text at build time (`features/docs/content.ts`), and the image needs those files
# at the same relative position the source expects them, one level above this app.

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/. .
COPY docs/ /docs/
COPY README.md /README.md

# Vite inlines env vars at build time, so the API URL is a build argument rather than
# a runtime one.
ARG VITE_API_BASE_URL=http://localhost:3333/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# 127.0.0.1, not `localhost`: in this image `localhost` resolves to ::1 first, while
# `listen 80` binds IPv4 only — the probe would be refused on a perfectly healthy server.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
