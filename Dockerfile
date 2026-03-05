# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /workspace

COPY package.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
WORKDIR /workspace
COPY . .
RUN npm run build
RUN npm prune --omit=dev --workspaces

FROM node:22-alpine AS runtime
WORKDIR /workspace

ENV NODE_ENV=production \
    PORT=6060 \
    APP_DATA_DIR=/app/data \
    BOOKS_DIR=/books \
    WEB_DIST_DIR=/workspace/apps/web/dist

RUN mkdir -p /app/data /books

COPY --from=build /workspace/package.json /workspace/.npmrc ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/apps/web/dist ./apps/web/dist
COPY --from=build /workspace/packages/shared ./packages/shared

EXPOSE 6060
CMD ["node", "apps/api/dist/server.js"]
