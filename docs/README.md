# Documentation

These pages tell you how to install, configure and run actual-crypto-sync, and how to work on it. To set it up for the first time, start with the [quick start](../README.md#quick-start).

## Use the tool

| Page                                           | What it tells you                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Installation](installation.md)                | The Docker image and its tags, and how to run the tool: command line, cron, Docker Compose and Kubernetes.             |
| [Configuration](configuration.md)              | Each key of the config file and its default, what the tool writes to Actual, the environment variables and errors.     |
| [Authentication](authentication.md)            | Which login method to use, how to get its secret, when a session expires, and how to fix login errors.                 |
| [Supported](supported.md)                      | All the chains, block explorers, price providers and built-in tokens, with their ids.                                  |
| [Logs, metrics and traces](monitoring.md)      | The log format, the metrics and the traces, for monitoring and alerts.                                                 |
| [Sending metrics and traces](opentelemetry.md) | How to connect the tool to your OpenTelemetry backend: protocols, endpoints, authentication, TLS, sampling and errors. |

## Work on the tool

| Page                          | What it tells you                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Development](development.md) | How to set up the project, run it against a local Actual server, test it, add a chain, explorer, provider or token, and how a release happens. |

Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [CODE_REVIEW_GUIDELINES.md](../CODE_REVIEW_GUIDELINES.md) before you open a pull request.
