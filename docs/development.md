# Development

This page tells you how to set up the project, run it against a local Actual server, test it, and add a chain, an explorer, a price provider or a token.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) first, and [CODE_REVIEW_GUIDELINES.md](../CODE_REVIEW_GUIDELINES.md) for what a reviewer checks.

## Setup

You can work with Node.js on your computer, or with Docker only.

**With Node.js:**

1. Install the Node.js version in [`.nvmrc`](../.nvmrc), for example with `nvm install`.
2. Run `npm ci`.

**With Docker only:** `docker build --target test .` installs the dependencies, checks the types and runs the tests. You do not need Node.js on your computer.

### Install scripts are off

[`.npmrc`](../.npmrc) sets `ignore-scripts=true`, so npm does not run the install scripts of dependencies. No dependency needs one: `better-sqlite3`, which `@actual-app/api` uses, ships its own prebuilt binaries. Without this setting, newer npm versions compile `better-sqlite3` anyway.

Thus, a new dependency that needs an install script does not work. Open an issue to discuss it first.

`.npmrc` also sets `save-exact=true`. Each dependency has an exact version, and `package-lock.json` is committed.

## TypeScript without a build step

Node.js runs the `.ts` files directly, with type stripping. There is no build step and no `dist/` folder. The Docker image runs `node src/main.ts`.

Type stripping removes the types and does nothing else. Thus:

- Use only TypeScript syntax that Node.js can remove. `enum`, `namespace` and parameter properties are not allowed. `tsconfig.json` sets `erasableSyntaxOnly`, so `tsc` finds them.
- Imports use the `.ts` extension: `import { loadConfig } from './config.ts'`.
- Imports of types only use `import type`. `tsconfig.json` sets `verbatimModuleSyntax`.

`npm run typecheck` runs `tsc`. It checks the types and writes no files.

## Commands

| Command               | What it does                                       |
| --------------------- | -------------------------------------------------- |
| `npm test`            | Checks the types, then runs all the unit tests.    |
| `npm run test:e2e`    | Runs the end-to-end tests in Docker.               |
| `npm run test:live`   | Runs the live checks against the real services.    |
| `npm run typecheck`   | Checks the types.                                  |
| `npm run lint`        | Runs the Biome checks without changes, as CI does. |
| `npm run format`      | Formats the code and fixes what Biome can fix.     |
| `npm start -- --help` | Runs the tool.                                     |
| `npm run dev:up`      | Starts the local Actual server.                    |
| `npm run dev:seed`    | Creates the dev budget on the local server.        |
| `npm run dev:run`     | Runs the tool against the dev budget.              |
| `npm run dev:down`    | Stops the local Actual server.                     |

## The dev stack

The dev stack is a local Actual server in Docker, at `http://localhost:5006`. Its version is the same as the version of `@actual-app/api`.

1. **Start the server:** `npm run dev:up`. The command waits until the server answers.
2. **Make your env file:** copy `dev/.env.example` to `dev/.env`. Git ignores `dev/.env`.
3. **Seed the budget:** `npm run dev:seed`. On a new server, it sets the server password from `dev/.env`. Then it creates a budget with the name `Dev` and the off-budget accounts of `dev/config.yml`. It prints the sync ID and a session token. Put them in `dev/.env`.
4. **Run the tool:** `npm run dev:run`. Add `-- --dry-run` to write nothing, or `-- --debug` to see each request.
5. **Log in with the password instead:** `npm run dev:run -- --config dev/config.password.yml`.

Open `http://localhost:5006` in a browser to see the transactions that the tool wrote.

`npm run dev:down` stops the server and keeps its data. `npm run dev:down -- -v` also deletes the data. Then start again from step 1.

`dev/config.yml` uses the public exchange wallets of the tests, so a run reads real balances and real prices.

### The cutoff check

`npm run dev:seed -- --cutoff-check` checks two things against the real server:

- Which transactions `getAccountBalance` counts. The tool expects that it counts all the transactions up to and including the cutoff date.
- Which transactions the tool reads before it plans an account, and in which order.

Run it after a change to the Actual version.

## Tests

- `npm test` runs all the unit tests with `node:test`.
- `docker build --target test .` runs the same tests in Docker, as CI does.
- The tests are in `test/`, in the same structure as `src/`.

Unit tests never call a real explorer, price provider or Actual server. Explorer and provider tests read recorded API responses from `test/fixtures/<explorer or provider>/`. Tests of the Actual calls use a fake of `@actual-app/api`.

### End-to-end tests

`npm run test:e2e` runs the tool against a real Actual server. You need only Docker. CI runs the same command after the unit tests.

The command starts a throwaway stack from `test/e2e/compose.yml`, runs the tests, and then removes the stack and its data. The stack has no ports and no volumes, so it does not change the dev stack.

- **`actual`** is the same Actual server version as the dev stack.
- **`e2e`** is the `test` stage of the Docker image. It runs `test/e2e/run.e2e.ts`.

The test seeds the server with `dev/seed.ts`. A mock server in the test process (`test/e2e/mock.ts`) answers as TronGrid, mempool.space and CoinGecko, with the responses in `test/fixtures/`. `test/e2e/config.yml` points each explorer and the price provider at the mock with `api_url`. The tests change the mock between runs, for example a new balance, or a price provider that fails. To test a new response, add it to `test/fixtures/`.

The tests call `run()` from `src/main.ts` with the same setup as the CLI, but with their own clock. Thus, they can sync on several days without a change to the tool. One test runs the real CLI.

The end-to-end file ends in `.e2e.ts`, not `.test.ts`, so `npm test` does not run it.

### Live checks

`npm run test:live` checks the built-in tokens, the explorers and the price providers against the real services. It takes about half a minute and needs no keys.

- **Tokens:** the decimals of each contract on chain are the decimals in `src/tokens.yml`. The CoinGecko id of each token belongs to the same contract on CoinGecko.
- **Explorers:** each explorer reads the public exchange wallets of its chain. The read must give a balance for each token. A balance of 0 is correct, because any wallet can be emptied.
- **Price providers:** each provider gives a price for each token that has an id for it. A normal run stops at the first provider that gives a price. The live checks ask every provider.

The checks take the chains, explorers, providers and tokens from the registries and `src/tokens.yml`, so a new one is checked without a change to the test. The test reads only the wallets in `test/live/registries.live.ts`, and test names show them as short addresses.

The `Live checks` workflow runs them every Monday, on demand, and on pull requests that change the tokens, a chain, a price provider or the checks. It is not a required check: a service that is down for a short time must not block other work. A failed weekly run tells you that a contract, an API or a price id changed.

The file ends in `.live.ts`, so `npm test` and the image build do not run it.

### Record a fixture

1. Call the API with one of the public exchange wallets. Use only these wallets:
   - TRON: `TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ`, `TF4EdKvoRoQz3DJA6osYj2z33ip2AqJKv2`
   - Bitcoin: `1KfRJ2RpTKu25riKP7SeY2vDCQE5xutArP`, `3AqC1QhDAi5QU7QvTGEzpoxJ22uThQp1Ba`, `bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v`
2. Do not send an API key, or remove it from all that you save.
3. Save the response as JSON in `test/fixtures/<explorer or provider>/`. Format it, so that a review can read it.
4. Read it in a test with `fixture('<explorer or provider>/<file>.json')` from `test/fakes.ts`.

Never use your own wallet in a fixture, a test or an example. See [CODE_REVIEW_GUIDELINES.md](../CODE_REVIEW_GUIDELINES.md#wallet-addresses).

## Lint and format

Biome lints and formats the code, the JSON files and the Markdown files.

- `npx biome check --write` (or `npm run format`) fixes what it can.
- `npm run lint` checks without changes. CI runs it.

## Add a chain

Open an issue with the [new chain form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-chain.yml) first.

1. Create `src/chains/<chain>/index.ts`. Export a `Chain` (see `src/types.ts`):
   - `id`, the native symbol, and if the chain has tokens.
   - `isValidAddress`, with the full checksum check of the chain. A typo in an address must be an error.
   - its explorers, and the default explorer list.
2. Add at least one explorer. See [Add an explorer](#add-an-explorer).
3. Register the chain in `src/chains/index.ts`.
   Add it to `config.schema.json`: under `chains`, to the chains of `accounts`, and to the chains of `tokens` if it has tokens. The schema tests fail until you do.
4. Add the native token, and popular tokens, to `src/tokens.yml`.
5. Add tests in `test/chains/<chain>/`: one test for each address rule, valid and not valid.
6. Add public exchange wallets for the chain to the list of wallets in [CODE_REVIEW_GUIDELINES.md](../CODE_REVIEW_GUIDELINES.md#wallet-addresses), in the same pull request. Use wallets of a well-known exchange, with a verified checksum.
7. Add the wallets to `WALLETS` in `test/live/registries.live.ts`. If the chain has tokens, also add a reader of contract decimals to `CONTRACT_DECIMALS`, and the CoinGecko platform id to `COINGECKO_PLATFORMS`. The [live checks](#live-checks) fail until you do.
8. Add the chain to [docs/supported.md](supported.md). Add it to the short list in the README only if the list has fewer than 5 chains.

## Add an explorer

Open an issue with the [new explorer form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-explorer.yml) first.

1. Create `src/chains/<chain>/<explorer>.ts`. Export an `Explorer` (see `src/types.ts`):
   - `getBalances` reads all the tokens of one wallet, in one request if the API allows it. It returns raw integer balances as `bigint`, by token symbol. The response is `unknown`: check each field before you use it.
   - `supportsContracts` is `true` only if the explorer reads contract tokens.
   - `settingKeys` lists its settings in the config, for example `api_url`. The config refuses any other setting.
   - `serialIntervalMs` is the wait after each request in serial mode. Use the rate limit of the API without a key.
   - `rateLimitAdvice` tells the user what to do when the API limits requests, or returns `null` for other errors.
2. Use `getJson`, `apiUrl` and `ApiError` from `src/http.ts`. Errors must never show the URL, the headers or the body, because they can hold a wallet address or a key.
3. Register the explorer in the `explorers` of its chain.
   Add it, with its settings, to the `explorers` of its chain in `config.schema.json`. The schema tests fail until you do.
4. Record fixtures, and test the parse of the response, each error, and `rateLimitAdvice`.
5. Add the explorer to [docs/supported.md](supported.md), and its settings to [docs/configuration.md](configuration.md). Add it to the short list in the README only if the list has fewer than 5 explorers.

## Add a price provider

Open an issue with the [new price provider form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-price-provider.yml) first.

1. Create `src/prices/<provider>.ts`. Export a `PriceProvider` (see `src/types.ts`):
   - `supportsCurrency` says which currencies the provider has prices in. The currency is a lowercase ISO 4217 code. If the API names currencies in another way, map them here.
   - `getQuotes` gets the prices of all the tokens in one request if the API allows it. It leaves out the tokens without a price.
   - `settingKeys`, `serialIntervalMs` and `rateLimitAdvice`, as for an explorer.
2. Register the provider in `src/prices/index.ts`.
   Add it, with its settings, to `providers` and `price_ids` in `config.schema.json`. The schema tests fail until you do.
3. Add the id of each built-in token at the provider to `price_ids` in `src/tokens.yml`.
4. Record fixtures, and test the currency mapping, the parse of the response and each error.
5. Add the provider to [docs/supported.md](supported.md), and its settings to [docs/configuration.md](configuration.md). Add it to the short list in the README only if the list has fewer than 5 providers.

## Add a built-in token

Open an issue with the [new token form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-token.yml) first.

1. Check the contract on a block explorer of the chain, for example Tronscan for TRON. Many fake tokens copy the name of a real token.
2. Copy the decimals from the contract.
3. Find the id at each price provider. On CoinGecko, check that the contract on the token page is the same contract.
4. Add the token to `src/tokens.yml`. Put the links that you checked in the pull request.
5. Add the token to [docs/supported.md](supported.md). Add it to the short list in the README only if the list has fewer than 5 tokens.
6. Run `npm run test:live`. It checks the decimals on chain and the CoinGecko id of the new token. The pull request runs it too.

The unit tests of `src/tokens.yml` check its rules, for example that each contract is a valid address and each token has a CoinGecko id. The [live checks](#live-checks) check its contents against the real services, so a new token needs no new test.

## How a release happens

[Release Please](https://github.com/googleapis/release-please) makes the releases from the commit messages.

1. The work for the next version collects in `develop`. See [Branches](../CONTRIBUTING.md#branches).
2. When it is time for a release, the maintainer merges `develop` into `main` with a pull request, or a `release/<version>` branch if the release needs changes first.
3. Each merge to `main` updates a release pull request. It has the next version and the changelog. Release Please opens it with the token of a GitHub App, so its checks run like on any other pull request. The `release` environment holds the app's `RELEASE_APP_CLIENT_ID` variable and `RELEASE_APP_PRIVATE_KEY` secret.
4. The maintainer merges the release pull request. A release that has only Actual updates merges by itself. See [Actual updates](#actual-updates).
5. Release Please then creates the tag and the GitHub release, and the release workflow builds the Docker image for amd64 and arm64 from the tag and pushes it to GHCR. Then it copies the image to Docker Hub as it is, so both registries have the same digest. It also copies `README.md` to the Docker Hub overview.
6. The milestone with the same name as the version, for example `v1.0.0`, closes. If it still has open issues, the workflow shows a warning, so they can move to another milestone.
7. A workflow merges `main` back into `develop`, so `develop` gets the new version number and the changelog. If the merge has a conflict, the workflow fails, and the maintainer merges by hand.

If the image build did not run for a release, the maintainer runs the Release workflow by hand: **Actions → Release → Run workflow**, with the tag, for example `v1.1.0`. It builds the image from the tag.

An urgent fix goes on a `hotfix/<name>` branch from `main`, with a pull request into `main`. Then the same steps from step 3 make a patch release, and step 7 brings the fix into `develop`.

### Actual updates

The tool is tested with one Actual version, and `@actual-app/api` must match the server. So each new Actual version becomes a patch release, with no manual step:

1. Renovate opens a pull request into `main` when the new version is 1 day old. It changes `@actual-app/api`, the `actual-server` image of the dev stack and the end-to-end tests, and the Actual version in the README (the badge and the "tested with" line). Its commit is a `fix(deps):` commit, so the release is a patch version.
2. Renovate merges the pull request when the checks pass. The end-to-end tests run against the new server.
3. Release Please updates the release pull request. The release has only Actual updates, so the workflow turns on auto-merge, and the release pull request merges when its checks pass.
4. Steps 5 to 7 above follow. The merge back brings the new Actual version into `develop`.

Renovate updates the Actual version only on `main`, and every other dependency only on `develop`. If a check fails, nothing merges, and the maintainer fixes the update on a `hotfix/<name>` branch.

The work that is planned for a version is on its [milestone](https://github.com/NicosKaralis/actual-crypto-sync/milestones). See [ROADMAP.md](../ROADMAP.md#how-a-request-is-planned).

The version comes from the commit types: `fix:` gives a patch version, `feat:` a minor version, and a breaking change a major version. See [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages).
