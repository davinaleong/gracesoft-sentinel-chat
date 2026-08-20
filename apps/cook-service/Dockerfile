# See apps/concierge-service/Dockerfile for the rationale — same shape.
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
WORKDIR /repo/apps/cook-service
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/index.js"]
