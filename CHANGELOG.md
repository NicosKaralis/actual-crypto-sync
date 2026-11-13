# Changelog

## 1.0.0 (2026-11-13)


### Features

* accept a single address for wallets ([d9233e9](https://github.com/NicosKaralis/actual-crypto-sync/commit/d9233e9559f4aec1868d85166183c8ab55f05094))
* add a placeholder CLI and a smoke test ([7d5518d](https://github.com/NicosKaralis/actual-crypto-sync/commit/7d5518da951099c74ee47bc6739db826a6cfd45b))
* add JSON logging and OpenTelemetry setup ([9f0baa5](https://github.com/NicosKaralis/actual-crypto-sync/commit/9f0baa59222515f57eb12c1788a0d4f371b61cce))
* add the built-in token registry ([716fbdc](https://github.com/NicosKaralis/actual-crypto-sync/commit/716fbdcc15864e84c1a95ea337b5188a9f39688d))
* add the chain and price provider registries ([55bbc2f](https://github.com/NicosKaralis/actual-crypto-sync/commit/55bbc2f13888964d15168b847c9eaf954896f9df))
* add the chain, explorer and price provider interfaces ([4bf6796](https://github.com/NicosKaralis/actual-crypto-sync/commit/4bf67964be9bea7798c6b040a3fc923332ea8697))
* collect balances and quotes across explorers and providers ([8cad8c0](https://github.com/NicosKaralis/actual-crypto-sync/commit/8cad8c09e0cfc5933c5050bc0c1c0845c8251fcb))
* fetch prices from CoinGecko ([192e98f](https://github.com/NicosKaralis/actual-crypto-sync/commit/192e98fe0c9a9a92622c76a220c2998f93b91053))
* format and parse sync notes ([5d2ed52](https://github.com/NicosKaralis/actual-crypto-sync/commit/5d2ed529c0488b127b5ab9959a8f7663096f8bed))
* load and check the config file ([699d1c5](https://github.com/NicosKaralis/actual-crypto-sync/commit/699d1c571467fdec9f49e4363546204eb4b4811f))
* load the config file, with the token and registry lookups ([112cfc5](https://github.com/NicosKaralis/actual-crypto-sync/commit/112cfc51754df1c2d5ab6396aa05640834ce9dbc))
* log in text by default, with LOG_FORMAT=json for log systems ([8d26aa6](https://github.com/NicosKaralis/actual-crypto-sync/commit/8d26aa60a239fafc41b368c00d5caa071953121c))
* log in text by default, with LOG_FORMAT=json for log systems ([f301724](https://github.com/NicosKaralis/actual-crypto-sync/commit/f3017247b7f34c21cb50cdbafb3a2a15b32be72e)), closes [#10](https://github.com/NicosKaralis/actual-crypto-sync/issues/10)
* notes and the per-account sync plan ([d12971e](https://github.com/NicosKaralis/actual-crypto-sync/commit/d12971ec3445bb1d1579786d4b8c062c5137f42d))
* open the budget and wrap @actual-app/api ([daa50e7](https://github.com/NicosKaralis/actual-crypto-sync/commit/daa50e785e67360bb2b2dfea855457f307703a72))
* plan each account's sync transaction for the day ([7a6bad3](https://github.com/NicosKaralis/actual-crypto-sync/commit/7a6bad3858355f5f2a3fd850cf294b4a62672766))
* read balances and prices from TronGrid, mempool.space and CoinGecko ([0006722](https://github.com/NicosKaralis/actual-crypto-sync/commit/000672299d8e8ea1c781b41125150d772bdab773))
* read OTEL_EXPORTER_OTLP_ENDPOINT for both signals ([dd22768](https://github.com/NicosKaralis/actual-crypto-sync/commit/dd22768fcdc826c9078c4296ae16fd6bbf252fa5))
* register the chains, explorers and price provider ([513d914](https://github.com/NicosKaralis/actual-crypto-sync/commit/513d914f268497f8c1d09835e31c86c875c2e1f7))
* run the sync from the CLI ([64a28f8](https://github.com/NicosKaralis/actual-crypto-sync/commit/64a28f84e3c44a2a6aa1f2c979686b04ca82cc86))
* sync the accounts with Actual, with JSON logs and OpenTelemetry ([e0ea1c9](https://github.com/NicosKaralis/actual-crypto-sync/commit/e0ea1c9c156dd0a74bdb05a0ad27fb51a5c0413c))
* validate Bitcoin addresses and read balances from mempool.space ([03b0151](https://github.com/NicosKaralis/actual-crypto-sync/commit/03b01517963f92ed45b84cdc54e2d1dde3328655))
* validate TRON addresses and read balances from TronGrid ([723f920](https://github.com/NicosKaralis/actual-crypto-sync/commit/723f920063fec3b75f8a65363522df9b436edfea))
* warn about rate limits and add a serial mode per explorer and provider ([165f6fc](https://github.com/NicosKaralis/actual-crypto-sync/commit/165f6fc632e0c70e2a1e00611445d192322ee88f))


### Bug Fixes

* **deps:** update dependency @opentelemetry/instrumentation-undici to v0.35.1 ([671fa77](https://github.com/NicosKaralis/actual-crypto-sync/commit/671fa7791348dcadae44b33c9131cfda97318a30))
* **deps:** update dependency @opentelemetry/instrumentation-undici to v0.35.1 ([8662dc5](https://github.com/NicosKaralis/actual-crypto-sync/commit/8662dc50d52056f7dc9619d152afe96e33a7526c))
* say a blank auth value is empty, not a pasted secret ([ab01952](https://github.com/NicosKaralis/actual-crypto-sync/commit/ab0195297f900014d904dfd1e1eb4716b5adc3fb))
* say when the data directory can't be used ([8460807](https://github.com/NicosKaralis/actual-crypto-sync/commit/846080750b1bab6427dc3529490bd111b8238b64))
* show in notes the value written to the account ([6d8125f](https://github.com/NicosKaralis/actual-crypto-sync/commit/6d8125f81d798ca3531530104548548896694a57))

## Changelog
