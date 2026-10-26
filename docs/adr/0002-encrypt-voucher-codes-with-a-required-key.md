# Encrypt voucher codes at rest with a mandatory key and no rotation

Voucher codes are equivalent to cash, so they are stored encrypted, a key must be supplied through the plugin options (the plugin refuses to start without it), and codes are matched for duplicates by a keyed hash rather than by their text. Key rotation is not supported in the first version: losing or changing the key makes existing codes unreadable, so the key has to be managed like any other secret.

## Considered options

- **Store codes as plain text**: rejected because a database leak would expose every unsold code.
- **Optional encryption**: rejected because a store that forgets to configure it would silently run unprotected.

## Consequences

- The key is needed by every process that loads the plugin, including `medusa db:migrate` in the host app: without it the migrations are applied but the command exits with an error.
- Duplicate detection compares keyed hashes of the code across all partners. A code that two partners legitimately issue cannot be imported twice. The partner is free text, so scoping the hash by partner would be defeated by a different spelling.
- The key must be at least 32 characters with at least 10 different characters. This only rejects obviously predictable values; it does not measure entropy.
