FROM node:20-bookworm-slim AS base
WORKDIR /app

# Install build deps for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# ── Build web apps ────────────────────────────────────────────────────────
FROM base AS web-builder
COPY web/controller/package.json ./web/controller/
COPY web/v1/package.json         ./web/v1/
COPY web/manage/package.json     ./web/manage/
RUN cd web/controller && npm install
RUN cd web/v1         && npm install
RUN cd web/manage     && npm install
# install shared deps at root so web/shared/ imports resolve correctly
RUN npm install socket.io-client@^4.7.5

COPY Dartboard.svg ./
COPY web/ ./web/
COPY server/package.json ./server/

RUN cd web/controller && npm run build
RUN cd web/v1         && npm run build
RUN cd web/manage     && npm run build

# ── Production server ─────────────────────────────────────────────────────
FROM base AS server
WORKDIR /app/server

COPY server/package.json ./
RUN npm install --production

COPY server/src/ ./src/
COPY --from=web-builder /app/server/public ./public
COPY Dartboard.svg ./public/dartboard.svg
COPY server/public/assets ./public/assets

ENV NODE_ENV=production
ENV PORT=80
ENV DB_PATH=/data/dartsleague.db

VOLUME ["/data"]
EXPOSE 80

CMD ["node", "src/index.js"]
