# Built from the monorepo root (see docker-compose.yml's `context: .`) since
# this is a pnpm workspace — the app can't be built in isolation from its
# own directory. Deliberately simple (builds the whole workspace, not just
# this app's dependency subgraph) for local dev/staging; image-size
# optimization (pnpm deploy, multi-stage pruning) is a Milestone 10
# hardening concern, not this milestone's.
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:20-slim
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo .
WORKDIR /repo/apps/concierge-service
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
