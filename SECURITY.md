# Security policy

## Report a vulnerability

Do not open a public issue for a security issue. Use GitHub [private vulnerability reporting](https://github.com/NicosKaralis/actual-crypto-sync/security/advisories/new).

In the report, give this information:

- The version that you run.
- What the issue is, and what an attacker can get from it.
- The steps to reproduce the issue.

**Do not put real API keys, passwords, session tokens or wallet addresses in the report.** Use made-up values.

I am the only maintainer, and I work on this project in my free time. I will reply as soon as possible. When a fix is ready, I will publish a release and a security advisory. If you agree, the advisory gives you credit.

## Supported versions

Only the latest minor version gets security fixes. For example, when 1.3 is the latest version, 1.3.x gets fixes and 1.2.x does not. To get a fix, update to the latest version.

## What is a security issue

These are security issues:

- **A secret or a wallet address leaks.** The tool must not show API keys, passwords, session tokens or full wallet addresses in logs, traces, metrics or error messages. Logs show only a short form of an address, for example `TC9F...R2MJ`. This also applies to `--debug`.
- **The tool writes wrong amounts to a budget.** For example, a run writes a transaction that sets an account to zero when an explorer or a price provider fails.
- **An issue in the Docker image.** For example, a vulnerable package in the image, or a file in the image that must not be there.

These are not security issues:

- A secret that you put in your own config file, logs or scheduler, and then shared.
- An issue in Actual Budget, an explorer or a price provider. Report it to that project.
- Wrong data from an explorer or a price provider, when the tool shows it correctly.

If you are not sure, report the issue privately. I will tell you if it is a security issue.
