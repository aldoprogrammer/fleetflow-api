FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY fleetflow-shared/package.json ./fleetflow-shared/
COPY fleetflow-api/package.json ./fleetflow-api/
COPY fleetflow-web/package.json ./fleetflow-web/
RUN pnpm install --filter @fleetflow/api... --filter fleetflow
COPY fleetflow-shared ./fleetflow-shared
COPY fleetflow-api ./fleetflow-api
RUN pnpm --filter @fleetflow/shared run build \
  && pnpm --filter @fleetflow/api exec prisma generate \
  && pnpm --filter @fleetflow/api run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/fleetflow-shared ./fleetflow-shared
COPY --from=build /app/fleetflow-api ./fleetflow-api
WORKDIR /app/fleetflow-api
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec prisma db seed && node dist/main.js"]
