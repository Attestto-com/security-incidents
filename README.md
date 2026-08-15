# Attestto — public incident register

This repository is the public record of security incidents affecting Attestto's own
systems, and the canonical home of the artefacts those incidents leave behind.

It exists so that the answer to *"has this ever happened to them, and what did they do
about it?"* is a link rather than a conversation.

## The commitment

Resolved incidents affecting our own systems are published here, including cause, impact
and response.

**This is a standing commitment, not a case-by-case decision.** Publishing selectively —
only the incidents that reflect well — is worse than not publishing at all, because the
silence becomes informative.

What is withheld, and only this: material that would compromise an ongoing investigation,
identify a victim, or expose an unpatched vulnerability. Where funds or infrastructure are
traced through intermediaries, exchange addresses and shared services are **not** named as
attacker infrastructure — naming an intermediary as a perpetrator is both wrong and
corrosive to the credibility of everything else in the report.

## Why the repository, and not a page on the website

Because a page can be edited and a repository cannot, quietly. The git history is the
guarantee: anyone can see what a record said before it said what it says now.

Where a published copy elsewhere and this repository disagree, **this repository governs**.

To follow changes, watch the repository or subscribe to the Atom feed GitHub publishes:

```
https://github.com/Attestto-com/security-incidents/commits/main.atom
```

## Contents

| Path | What it is |
|---|---|
| `incidents/` | One record per resolved incident |
| `attest-metadata.json` | Token metadata for the discontinued `$ATTEST` mint — see below |

### `attest-metadata.json`

This file is referenced **on-chain**, permanently, by the Metaplex metadata account of the
`$ATTEST` SPL mint. It is served from this repository specifically because a token URI
cannot be changed once the update authority is revoked, and this repository is the one we
commit to keeping.

**Do not move, rename or delete it.** If this repository is ever restructured, that file
stays where it is. Any wallet or explorer rendering `$ATTEST` reads it, and the alternative
to it resolving is a hostname somebody else can claim — which is exactly the failure this
record documents.

## Reporting something

Security reports go to **security@attestto.com**. Do not open an issue here for an
unreported vulnerability.

## Related

- [`solana-nonce-brick`](https://github.com/Attestto-com/solana-nonce-brick) — technical
  writeup of the durable-nonce bricking technique, written for victims of the same
  operator rather than for us. If that repository is ever archived, this one keeps the
  record.
