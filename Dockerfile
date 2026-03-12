# ── Stage 1: install production dependencies ─────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: lean production image ───────────────────────────────────────────
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as non-root for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/

USER appuser
EXPOSE 3000
CMD ["node", "server.js"]
