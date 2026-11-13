# Authentication

actual-crypto-sync logs in to your Actual server to download and change your budget. This page tells you which login method to use, how to get its secret, and how to fix login errors.

This page is for Actual server **26.11.0**, the version that the tool is tested with.

The config sets exactly one method under `actual.auth`, always as a `${VAR}` reference:

```yaml
actual:
  auth:
    session: ${ACTUAL_SESSION_TOKEN}
    # password: ${ACTUAL_PASSWORD}
    # api_key: ${ACTUAL_API_KEY}
```

## Which method to use

| Your server                                 | Method                                                               |
| ------------------------------------------- | -------------------------------------------------------------------- |
| One user, password login                    | `password`, or `session` to keep the password out of your scheduler. |
| OpenID, or more than one user               | `session`, with a dedicated user for the tool.                       |
| A server with API keys (newer than 26.11.0) | `api_key`.                                                           |

`encryption_password` is not a login method. It decrypts a budget with end-to-end encryption, after the login. See [docs/configuration.md](configuration.md#encryption_password).

## `password`

`password` is the server password. With it, the tool logs in as the original owner of the server.

- It works on a server with password login.
- It works on a server that moved from password login to OpenID, unless `ACTUAL_ALLOWED_LOGIN_METHODS` does not include `password`.
- It does not work on a server that started with OpenID. That server has no original owner.
- `ACTUAL_OPENID_ENFORCE` alone does not turn it off. That setting only hides password login on the login page.

The owner can see all the budgets on the server. On a server with more than one user, use `session` with a dedicated user.

## `session`

A session token comes from a normal login, with a password or with OpenID. The server accepts it in the same way for both. With a session token, the tool has the access of the user that logged in.

The recommended way is a **dedicated user** for the tool. Then:

- The tool can only see the budgets that you share with that user.
- You can disable that user without a change to your own login.
- When you log out of your own sessions, the tool continues to work.

### Get a session token with OpenID

These steps use [Authentik](https://goauthentik.io) as the example. Other OpenID providers work in the same way.

1. **Create a user for the tool at your OpenID provider.** In Authentik, create the user and give it access to the application that you use for Actual.
2. **Add the user in Actual.** Open the user directory in Actual and add the user. An OpenID login fails for a user that is not in the user directory.
3. **Share the budget with the user.** Share only the budget that the tool syncs.
4. **Log in as the user one time.** Use a private browser window, so your own session is not changed.
5. **Copy the token.** Use one of these two ways:
   - At the end of the login, the server sends the browser to `/openid-cb?token=...`. Copy the token from the address bar, or from the network tab of the developer tools.
   - Open the developer tools, then **Application**, then **IndexedDB**, then `actual`, then `asyncStorage`. The token is the value of the key `user-token`.
6. **Close the window. Do not log out.** A log out deletes the session, and the token stops working.
7. **Store the token as a secret**, for example in a Kubernetes Secret or an env file. Set `auth.session: ${ACTUAL_SESSION_TOKEN}`.

### Get a session token with a password

On a server with password login, this request returns a session token:

```sh
curl -X POST https://actual.example.com/account/login \
  -H 'content-type: application/json' \
  -d '{"loginMethod":"password","password":"..."}'
```

The answer is `{"status":"ok","data":{"token":"..."}}`. Store the value of `token` as a secret.

### When does the token expire

The server setting `ACTUAL_TOKEN_EXPIRATION` sets the expiry of the sessions. **It applies to all users of the server**, not only to the tool.

| `ACTUAL_TOKEN_EXPIRATION` | What happens                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `never` (the default)     | Sessions do not expire.                                                                                            |
| `openid-provider`         | An OpenID session ends when the token of the provider ends, usually after some hours. This does not suit the tool. |
| A number                  | Seconds for OpenID sessions, but minutes for password sessions.                                                    |

With `never`, the session of the tool does not expire, but the sessions of all other users on the server do not expire either. Each server admin must decide if that is acceptable for their server.

The token also stops working when:

- The user logs out.
- The user is disabled or deleted.
- OpenID is turned on or off on the server. This ends all sessions.
- The password changes. This ends all password sessions.

To replace the token, log in again and update the secret. To stop the tool, disable its user in Actual.

## `api_key`

API keys come in Actual server versions after 26.11.0. A 26.11.0 server does not know them and refuses them.

On a server with API keys:

1. In Actual, open the settings and create an API key for the budget that the tool syncs.
2. Copy the key. Actual shows it one time only.
3. Store the key as a secret. Set `auth.api_key: ${ACTUAL_API_KEY}`.

A key starts with `actual_`, and has 43 more characters. A key can only open the budgets that it was created for. It stops working when you revoke it, or when its user loses access to the budget.

## Security notes

- A session token or an API key has the access of its user. Share only the budget that the tool syncs with the dedicated user.
- A dedicated user shows up on its own in the user directory, and you can disable it on its own. Your own token gives the tool access to all your budgets, and your next log out stops the tool.
- Do not keep password login on next to OpenID only for the tool. The password logs in as the owner, who can see all the budgets.
- The tool never writes a password, a token or a key in its logs, traces or errors.

## Troubleshooting

The login errors and the budget-not-found error end with `(docs/authentication.md)`. Search this page for the start of the message.

| Error                                                                                              | Cause and fix                                                                                                                |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `can't reach the Actual server at <url>`                                                           | The tool cannot connect to `actual.server_url`. Check the URL, and that the tool can reach the server from where it runs.    |
| `session token rejected or expired; log in again and replace it`                                   | The session ended: a log out, a disabled user, an expiry, or OpenID turned on or off. Get a new token and update the secret. |
| `password rejected`                                                                                | The server password is wrong.                                                                                                |
| `password login isn't available on this server (it may use OpenID only); use auth.session`         | The server started with OpenID, or `ACTUAL_ALLOWED_LOGIN_METHODS` does not include `password`. Use `session`.                |
| `API key rejected; it may be revoked, or the server may be older than API keys (26.11.0 has none)` | The key is revoked or lost its access, or the server does not have API keys. On 26.11.0, use `session`.                      |
| `login failed (<code>)`                                                                            | Another login error. The code comes from the server.                                                                         |
| `budget <sync id> not found or not shared with this user`                                          | Check `actual.sync_id`. With a dedicated user, share the budget with that user.                                              |
| `can't download budget <sync id> (<code>)`                                                         | The download failed. For an encrypted budget, check `encryption_password`.                                                   |
| `can't use the data directory <dir> (<code>); set ACTUAL_DATA_DIR to a writable directory`         | The tool cannot write its copy of the budget. Mount a writable volume, or set `ACTUAL_DATA_DIR`.                             |

The config check finds these errors before the login:

| Error                                                                                          | Fix                                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `actual.auth: set one of session, password, api_key`                                           | Add one method.                                                               |
| `actual.auth: set only one of session, password, api_key; found ...`                           | Remove all methods but one.                                                   |
| `actual.auth.<method>: use ${VAR}, never the secret itself`                                    | Put the secret in an environment variable, and write `${NAME}` in the config. |
| `actual.auth.<method>: empty; set it to a ${VAR} reference, e.g. ...`                          | Write a `${VAR}` reference after the key.                                     |
| `actual.auth.<method>: environment variable NAME is not set`                                   | Set the variable for the tool.                                                |
| `actual.auth.<method>: ${NAME} is empty`                                                       | The variable is set, but has no value.                                        |
| `actual.auth.session: ${NAME} looks like an Actual API key; set it as auth.api_key`            | Move the reference from `session` to `api_key`.                               |
| `actual.auth.api_key: ${NAME} doesn't look like an Actual API key (actual_ and 43 characters)` | Check that the variable holds an API key, not a session token.                |
