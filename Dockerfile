# Stage 1: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY channels/ channels/
COPY skills/ skills/
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Stage 2: Runtime
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
EXPOSE 18789
VOLUME /root/.xclaw
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["start"]
