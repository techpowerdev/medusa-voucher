Status: implemented (written retroactively; code in PR #3 and PR #4)

# Protect Voucher codes and PINs

## Problem Statement

A Voucher code is money: anyone who reads it can redeem it at the Partner. Codes sit in the database and could leak through a backup, a log, a careless API route or a screen. They must also be unique across the whole Pool, because selling one code twice means one customer is turned away at the counter.

## Solution

Voucher codes and PINs are encrypted before they are stored and decrypted only through one dedicated method. A separate keyed hash of each code enforces uniqueness without needing to decrypt anything. The encryption key is a required plugin option, so a store cannot run, or import, without it.

## User Stories

1. As a store owner, I want codes and PINs encrypted at rest, so that a database dump does not reveal redeemable codes.
2. As a store owner, I want the application to refuse to start without a strong encryption key, so that I cannot run unprotected by mistake.
3. As a store owner, I want an obviously weak key (too short, or a few repeated characters) rejected, so that "aaaa…" does not count as a key.
4. As a store owner, I want the key kept outside the database, so that a database leak alone is not enough to read codes.
5. As an operator, I want to see only the last characters of a code in lists (a hint), so that I can tell Vouchers apart without exposing them.
6. As a developer, I want one place that creates Vouchers and one that reveals them, so that every other part of the system can be reviewed for leaks easily.
7. As a developer, I want errors and logs to name positions or ids and never a code or PIN, so that secrets stay out of observability tools.
8. As a store owner, I want the same code rejected whichever Partner or batch it is in, so that no code is sold twice.
9. As a store owner, I want to know that losing the key makes stored codes unrecoverable, so that I back it up.

## Implementation Decisions

- Authenticated encryption with a per-value random nonce; the stored form is versioned so the scheme can change later. Separate encryption and hashing keys are derived from the master key, so one cannot be used for the other.
- The duplicate check uses a keyed hash of the trimmed code, not the plain code, so the unique column does not reveal codes and cannot be brute-forced without the key. The hash is unique across all Partners and batches.
- The code hint is the last four characters for codes of at least twelve characters, the last two for six to eleven, and nothing for shorter codes.
- The key must be at least 32 characters with at least 10 distinct characters. This is checked by a loader at start-up and again when the service is created.
- The generated create/update/list methods of the module service accept and return the encrypted columns. They must never be exposed by an API route. Only the import method may create Vouchers, and only the reveal method may decrypt; any route that reveals must check authorization first.
- `medusa db:migrate` also loads the plugin; without the key the migrations apply but the command exits with an error, so the key must be set in every environment that migrates.
- Key rotation is not supported yet; the versioned format leaves room for it.
- See ADR-0002 for the decision and its consequences.

## Testing Decisions

- Tests check behaviour: a stored Voucher contains no plain code or PIN, decryption returns the originals, a wrong or missing key fails, tampered data is rejected, and errors never contain a code.
- Unit tests for the cryptography and the start-up check (no database); module tests for the service against a real database; the HTTP test proves the key reaches the service through the host application's plugin options.
- Prior art: the existing crypto unit tests and module tests.

## Out of Scope

- Key rotation and re-encryption of stored codes.
- The API route and permission model for revealing a code to staff or customers.
- Showing a QR code or sending a code to a customer (Delivery).
- Per-environment key management advice beyond the README.

## Further Notes

- The QR code encodes the code alone, never the PIN, and is generated from the code when shown; nothing extra is stored.
