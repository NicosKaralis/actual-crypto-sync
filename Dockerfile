# syntax=docker/dockerfile:1

# Node runs the .ts files directly (type stripping), so there is no build stage.
# Keep the version in line with .nvmrc.
FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS base
WORKDIR /app
COPY package.json package-lock.json .npmrc ./

# Production dependencies only. better-sqlite3 (from @actual-app/api) is native and
# ships prebuilt binaries for linux x64 and arm64; .npmrc skips install scripts so
# npm never tries to compile it.
FROM base AS deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# Every dependency, the type check and the unit tests.
FROM base AS test
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm test && touch /tmp/tests-passed

FROM node:26.13.1-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc AS runtime
ENV NODE_ENV=production \
    ACTUAL_DATA_DIR=/cache \
    CONFIG_FILE=/config/config.yml
WORKDIR /app
# Makes `docker build .` fail when the tests fail.
COPY --from=test /tmp/tests-passed /tmp/tests-passed
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /cache /config && chown node:node /cache
USER node
ENTRYPOINT ["node", "/app/src/main.ts"]
