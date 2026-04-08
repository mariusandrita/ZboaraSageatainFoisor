FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install build deps for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# ── Build web apps ────────────────────────────────────────────────────────
FROM base AS web-builder
COPY web/controller/package.json ./web/controller/
COPY web/tv/package.json         ./web/tv/
RUN cd web/controller && npm install
RUN cd web/tv         && npm install

COPY web/ ./web/
COPY server/package.json ./server/

RUN cd web/controller && npm run build
RUN cd web/tv         && npm run build

# ── Production server ─────────────────────────────────────────────────────
FROM base AS server
WORKDIR /app/server

COPY server/package.json ./
RUN npm install --production

COPY server/src/ ./src/
COPY --from=web-builder /app/server/public ./public
COPY Dartboard.svg ./public/dartboard.svg

ENV NODE_ENV=production
ENV PORT=80
ENV DB_PATH=/data/dartsleague.db

VOLUME ["/data"]
EXPOSE 80

CMD ["node", "src/index.js"]
