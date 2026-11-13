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
4. Add the native token, and popular tokens, to `src/tokens.yml`.
5. Add tests in `test/chains/<chain>/`: one test for each address rule, valid and not valid.
6. Add public exchange wallets for the chain to the list of wallets in [CODE_REVIEW_GUIDELINES.md](../CODE_REVIEW_GUIDELINES.md#wallet-addresses), in the same pull request. Use wallets of a well-known exchange, with a verified checksum.
7. Add the chain to the tables in the README and in [docs/configuration.md](configuration.md).

## Add an explorer

Open an issue with the [new explorer form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-explorer.yml) first.

1. Create `src/chains/<chain>/<explorer>.ts`. Export an `Explorer` (see `src/types.ts`):
   - `getBalances` reads all the tokens of one wallet, in one request if the API allows it. It returns raw integer balances as `bigint`, by token symbol. The response is `unknown`: check each field before you use it.
   - `supportsContracts` is `true` only if the explorer reads contract tokens.
   - `serialIntervalMs` is the wait after each request in serial mode. Use the rate limit of the API without a key.
   - `rateLimitAdvice` tells the user what to do when the API limits requests, or returns `null` for other errors.
2. Use `getJson`, `apiUrl` and `ApiError` from `src/http.ts`. Errors must never show the URL, the headers or the body, because they can hold a wallet address or a key.
3. Register the explorer in the `explorers` of its chain.
4. Record fixtures, and test the parse of the response, each error, and `rateLimitAdvice`.
5. Add the explorer and its settings to [docs/configuration.md](configuration.md) and the README.

## Add a price provider

Open an issue with the [new price provider form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-price-provider.yml) first.

1. Create `src/prices/<provider>.ts`. Export a `PriceProvider` (see `src/types.ts`):
   - `supportsCurrency` says which currencies the provider has prices in. The currency is a lowercase ISO 4217 code. If the API names currencies in another way, map them here.
   - `getQuotes` gets the prices of all the tokens in one request if the API allows it. It leaves out the tokens without a price.
   - `serialIntervalMs` and `rateLimitAdvice`, as for an explorer.
2. Register the provider in `src/prices/index.ts`.
3. Add the id of each built-in token at the provider to `price_ids` in `src/tokens.yml`.
4. Record fixtures, and test the currency mapping, the parse of the response and each error.
5. Add the provider to [docs/configuration.md](configuration.md) and the README.

## Add a built-in token

Open an issue with the [new token form](https://github.com/NicosKaralis/actual-crypto-sync/issues/new?template=new-token.yml) first.

1. Check the contract on a block explorer of the chain, for example Tronscan for TRON. Many fake tokens copy the name of a real token.
2. Copy the decimals from the contract.
3. Find the id at each price provider. On CoinGecko, check that the contract on the token page is the same contract.
4. Add the token to `src/tokens.yml`. Put the links that you checked in the pull request.
5. Add the token to the tables in the README and in [docs/configuration.md](configuration.md).

The tests of `src/tokens.yml` check its rules, for example that each contract is a valid address and each token has a CoinGecko id. They do not check its contents, so a new token needs no new test.

A new built-in token can break a config that already defines a token with the same symbol in `tokens:`. The changelog must tell users. See [Breaking changes](../CODE_REVIEW_GUIDELINES.md#breaking-changes).

## How a release happens

[Release Please](https://github.com/googleapis/release-please) makes the releases from the commit messages.

1. Each merge to `main` updates a release pull request. It has the next version and the changelog.
2. The maintainer merges the release pull request when it is time for a release.
3. Release Please then creates the tag and the GitHub release, and the release workflow builds the Docker image for amd64 and arm64 and pushes it to GHCR.

The version comes from the commit types: `fix:` gives a patch version, `feat:` a minor version, and a breaking change a major version. See [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages).
