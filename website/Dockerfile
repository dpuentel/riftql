# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV ASTRO_TELEMETRY_DISABLED=1
RUN corepack enable

COPY package.json ./package.json
COPY docs ./docs
COPY website/package.json website/pnpm-lock.yaml website/pnpm-workspace.yaml ./website/

RUN pnpm --dir website install --frozen-lockfile

COPY website ./website

RUN pnpm --dir website build

FROM nginx:1.27-alpine AS runtime

COPY website/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/website/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
