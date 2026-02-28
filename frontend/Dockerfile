# ── Dependencies stage ──────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── Build stage ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
ARG NEXT_PUBLIC_AGENT_JURY_CONTRACT=0x0000000000000000000000000000000000000000
ARG NEXT_PUBLIC_MONAD_CHAIN_ID=10143
ARG NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz
ARG NEXT_PUBLIC_API_KEY=

ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_AGENT_JURY_CONTRACT=$NEXT_PUBLIC_AGENT_JURY_CONTRACT
ENV NEXT_PUBLIC_MONAD_CHAIN_ID=$NEXT_PUBLIC_MONAD_CHAIN_ID
ENV NEXT_PUBLIC_MONAD_RPC_URL=$NEXT_PUBLIC_MONAD_RPC_URL
ENV NEXT_PUBLIC_API_KEY=$NEXT_PUBLIC_API_KEY

RUN npm run build

# ── Production stage ───────────────────────────
FROM node:20-alpine

RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
