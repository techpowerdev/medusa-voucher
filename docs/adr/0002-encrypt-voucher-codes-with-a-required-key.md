# Encrypt voucher codes at rest with a mandatory key and no rotation

Voucher codes are equivalent to cash, so they are stored encrypted, a key must be supplied through the plugin options (the plugin refuses to start without it), and codes are matched for duplicates by a keyed hash rather than by their text. Key rotation is not supported in the first version: losing or changing the key makes existing codes unreadable, so the key has to be managed like any other secret.

## Considered options

- **Store codes as plain text**: rejected because a database leak would expose every unsold code.
- **Optional encryption**: rejected because a store that forgets to configure it would silently run unprotected.
