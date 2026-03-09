FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/cli/package.json ./packages/cli/
COPY packages/core/package.json ./packages/core/
COPY packages/memory/package.json ./packages/memory/

# Install dependencies (production only for memory, full for cli/core)
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/cli ./packages/cli/
COPY packages/core ./packages/core/
COPY packages/memory ./packages/memory/
COPY tsconfig.json ./

# Build CLI
RUN pnpm --filter cli build

# ─────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artifacts
COPY --from=builder /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder /app/packages/cli/package.json ./packages/cli/
COPY --from=builder /app/packages/core ./packages/core/
COPY --from=builder /app/packages/memory ./packages/memory/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/cli/node_modules ./packages/cli/node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Install curl for healthchecks
RUN apk add --no-cache curl bash sqlite

# Create data directories
RUN mkdir -p /data/memory /data/config /config

# Rex config and memory in /data
ENV REX_HOME=/data
ENV OLLAMA_URL=http://ollama:11434
ENV NODE_ENV=production

# Create rex symlink
RUN ln -s /app/packages/cli/dist/index.js /usr/local/bin/rex && chmod +x /usr/local/bin/rex

EXPOSE 7420

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:7420/api/health || exit 1

CMD ["node", "/app/packages/cli/dist/index.js", "hub", "--port=7420"]
