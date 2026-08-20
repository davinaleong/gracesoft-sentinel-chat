# See apps/concierge-service/Dockerfile for the rationale — same shape.
# Deliberately its own image/deploy target, independent of concierge-service
# and cook-service — taking either of those down must never take the legal
# pages down with it.
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-slim
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo .
WORKDIR /repo/apps/legal-site
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/index.js"]
