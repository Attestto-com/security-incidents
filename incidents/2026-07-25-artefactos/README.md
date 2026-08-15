# Artefactos — 2026-07-25

What was actually executed in response to the incident. Kept because a response
described in prose is a claim; the code that ran is evidence.

## `close-token.mjs`

**Already executed. It cannot run again, and it should not be run.**

One atomic transaction with two instructions: repoint the `$ATTEST` metadata URI
away from a hostname that had become claimable by anyone, and permanently revoke
the mint authority.

```
tx     2VcaZ8JoMi86Dt1yZfni3MfuuyPqc4Q2GmLVNw2G9g9mhg44EC3Yfa8HGy2XN6VtzpbbZDkP3mZo9c4SLqZpgm2M
date   2026-08-14
```

Verified on chain after confirmation:

```
mint authority   : null
freeze authority : null
supply           : 1000000000000000 (final)
metadata uri     : .../security-incidents/main/attest-metadata.json
```

The script aborts unless the signer is the expected authority, refuses any
`*.pages.dev` target, and will not sign unless the destination URI already
returns HTTP 200 with valid JSON — so it cannot trade a dead URI for another
dead one. The mint authority is now `null` and `SetAuthority` cannot
re-establish it, so the first of those guards can never pass again.

It contains no key material. The key was supplied at runtime by file path,
never on the command line, because a key pasted into a shell survives in
history, in `ps`, and in scrollback.

## Why the URI points where it does

A token URI becomes permanent the moment the update authority is revoked, so it
must resolve to something the organisation commits to keeping. That is this
repository, and specifically `attest-metadata.json` at its root — see the note
in the top-level README about not moving that file.
