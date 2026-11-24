# syntax=docker/dockerfile:1@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183

# Node runs the .ts files directly (type stripping), so there is no build stage.
# Keep the version in line with .nvmrc.
FROM node:26.13.1-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS base
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

FROM node:26.13.1-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS runtime
ENV NODE_ENV=production \
    ACTUAL_DATA_DIR=/cache \
    CONFIG_FILE=/config/config.yml
WORKDIR /app
# Makes `docker build .` fail when the tests fail.
COPY --from=test /tmp/tests-passed /tmp/tests-passed
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY tokens.yml ./
COPY tokens ./tokens
RUN mkdir -p /cache /config && chown node:node /cache
USER node
ENTRYPOINT ["node", "/app/src/main.ts"]
