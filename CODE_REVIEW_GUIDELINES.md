# Code review guidelines

This document is for all reviewers of a pull request: people, and AI agents that review code. It gives the rules of this project that a reviewer cannot see from the code alone.

[CONTRIBUTING.md](CONTRIBUTING.md) gives the general rules for contributions. This document does not repeat them.

If a pull request breaks a rule in this document, ask for a change. Do not approve it.

## Wallet addresses

**Do not approve real personal wallet addresses in the repository.** This applies to code, tests, fixtures, examples, docs, issues and commit messages. It also applies to a short form of a personal address.

Tests, fixtures, examples and docs use only these public exchange wallets:

| Chain   | Address                                      |
| ------- | -------------------------------------------- |
| TRON    | `TC9F6tRXT1gRv3hdFv35sGkFe5P2EdR2MJ`         |
| TRON    | `TF4EdKvoRoQz3DJA6osYj2z33ip2AqJKv2`         |
| Bitcoin | `1KfRJ2RpTKu25riKP7SeY2vDCQE5xutArP`         |
| Bitcoin | `3AqC1QhDAi5QU7QvTGEzpoxJ22uThQp1Ba`         |
| Bitcoin | `bc1q0qfzuge7vr5s2xkczrjkccmxemlyyn8mhx298v` |

Bitcoin address tests can also use the test vectors of BIP-173 and BIP-350.

## Secrets and logs

**Flag all code that can show a secret.** Secrets are passwords, session tokens, API keys and the budget encryption password.

- A secret must not go into a log, a span attribute, a metric label or an error message. This also applies to `--debug` output.
- An error from `@actual-app/api` or from an HTTP request can contain a secret. The code must not show it as is.
- Logs, spans and metrics show a wallet address only in its short form, for example `TC9F...R2MJ`. Use `walletPrefix` in `src/format.ts`.
- `--debug` logs the URL of a request without its credentials and query string, and with the addresses in its path in their short form. Use `redactUrl` in `src/format.ts`. Do not log headers or bodies.
- Do not log the resolved config. It contains the values of the environment variables.

## Money and numbers

**Flag floating-point arithmetic on money.**

- Raw chain balances are `bigint`. Only `src/format.ts` converts them to numbers.
- Amounts in Actual are integer cents. The code rounds them one time, with `Math.round(balance * price * 100)`. Do not add or subtract amounts as floats.
- Notes never use exponent notation. For example, a note shows `0.00000012`, not `1.2e-7`.

## Writing to the budget

The tool writes to the budget of the user. A mistake can change the money that a user sees. Examine these items carefully:

- **One sync transaction per account per day.** The code sorts the transactions by date (newest first), then by id. Then it keeps the first sync transaction of the day and deletes the others. Thus, two runs at the same time keep the same transaction. The code never changes a transaction that the user added.
- **No price, no write.** If no price provider gives a price for a token, the tool must not write to the accounts of that token. A price of 0 sets the account to zero.
- **One explorer per wallet in a run.** If an explorer fails for one token of a wallet, the next explorer reads all the tokens of that wallet. The tool does not mix two explorers for one wallet.
- **Notes from earlier versions.** The tool must read the notes of all earlier versions. A change to `parseNote` or `buildNote` needs a test with an earlier note.

## Types

- **Do not approve `any`.** Biome rejects it.
- **API data is `unknown`.** Code that reads a response from an explorer, a price provider or a file starts with `unknown`. Then it checks the data before it uses it. Do not approve code that uses a response without a check.
- **Use `as` only after a check.** An `as` is correct when the code above it proves the type, for example `typeof value === 'object'`. Prefer `satisfies` when the value must match a type.
- **Do not approve new `biome-ignore`, `@ts-ignore` or `@ts-expect-error` comments.** Fix the cause.
- The code runs with Node type stripping. `tsconfig.json` sets `erasableSyntaxOnly`, so `enum`, `namespace` and parameter properties are not allowed. Imports use the `.ts` extension.

## Tests

- **Each new feature or fix has a test.** The test must fail without the change.
- **Unit tests do not call real services.** Tests use recorded fixtures in `test/fixtures/<explorer or provider>/`. Do not approve a test that calls an explorer, a price provider or an Actual server.
- **Fixtures contain only the public exchange wallets** of the list above. Remove all API keys from recorded requests.
- Use real code in tests. Use a fake only for a network service or the Actual API.

## Breaking changes

These items are the public interface of the tool:

- The config file: keys, their meaning, defaults, and explorer and provider ids.
- CLI flags and environment variables.
- The note format.
- What the tool writes to Actual: one transaction per account per day, the payee and the cleared flags.
- Metric names and labels.

A change to one of these items is a breaking change. The commit must have `!` after the type and a `BREAKING CHANGE:` footer. The footer tells users what they must do. If a pull request changes one of these items without the marks, ask for them.

These changes are not breaking changes: a new chain, explorer, price provider, built-in token or optional config key. A new built-in token can break a config that already defines a token with the same symbol. In that case, the changelog must tell users.

The TypeScript interfaces in `src/types.ts` are not public. They can change in all versions.

## Dependencies and workflows

- Each dependency has an exact version, and the pull request includes `package-lock.json`.
- Do not approve a new dependency that needs an install script. `.npmrc` sets `ignore-scripts=true`.
- `@actual-app/api` and the `actual-server` image always have the same version.
- GitHub Actions use a commit SHA, with the version in a comment.
- The image for each architecture builds on a runner of that architecture, not under QEMU.

## Docs

- A change that a user can see updates the docs and `config.example.yml`.
- A new chain, explorer, price provider or built-in token updates the tables in the README.

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md): how to contribute.
- [SECURITY.md](SECURITY.md): what a security issue is.
- [ROADMAP.md](ROADMAP.md): what can come next.
