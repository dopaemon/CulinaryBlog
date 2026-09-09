FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache python3 make g++
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY packages ./packages
COPY apps/backend ./apps/backend
RUN pnpm --filter backend build && \
    pnpm install --frozen-lockfile --prod

FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/apps/backend/package.json ./apps/backend/
WORKDIR /repo/apps/backend
EXPOSE 5000
CMD ["node", "dist/main"]
