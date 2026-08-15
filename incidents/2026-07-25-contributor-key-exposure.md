# 2026-07-25 — Contributor private key exposed in a public repository

**Status:** resolved · **Published:** 2026-08-14

## What happened

A Solana private key was committed to a **public GitHub repository** as a fallback default
value:

```js
const PRIVATE_KEY_B58 = process.env.KEY || "<the actual key>";
```

An automated scraper watching the public GitHub events firehose found and used it **4
minutes and 53 seconds** after the push. The wallet was drained, then re-created as a
durable nonce account — a technique that permanently immobilises everything that arrives
in it afterwards.

Total loss: **2.4985 SOL**, unrecoverable.

## What it touched, and what it did not

The repository was a **contributor's personal one**, not ours, and the key belonged to a
personal wallet. No Attestto codebase, published package or operated service was involved
in the exposure.

We checked rather than assumed. Every `@attestto/*` release published after the compromise
reconciles to a known version — no unexplained versions, no republished tags, no
supply-chain compromise. No evidence of compromise of our hosting or DNS accounts, and no
activity in them during the drain window.

What it did touch was ours: the wallet was the declared vault address of a token branded
`$ATTEST` and the admin wallet of a governance application served under one of our
domains. **The defect was in our process, not in our product** — no published component
behaved incorrectly and no control we had built failed. The problem was that credentials
were allowed to exist somewhere no control of ours reached.

## Root cause

**The absence of our own internal controls.** Not the pattern, not the tooling, not the
machine — those are the shape this took. Had none of them been present, the same gap would
have been available to anything else.

None of the following existed at the time:

| Missing control | What it would have stopped |
|---|---|
| Secret scanning and push protection | the push itself |
| A commit-time hook on developer machines | the commit, before any remote saw it |
| A rule on where credentials may exist | a live key being usable in a scratch project |
| An approved-tooling policy for AI coding agents | unreviewed generated code near credentials |
| A baseline for newly provisioned machines | that machine starting with no protections |

The individual mistake is real but it is not the cause. Every organisation contains people
who will one day paste a key into the wrong file at the wrong hour; the ones that do not
lose funds are the ones where something is watching when it happens. **Nothing was
watching.**

## Response

1. **Confirmed the funds were unrecoverable** on devnet, against a faithful reproduction,
   before doing anything irreversible.
2. **Recovered what was still controllable.** The `$ATTEST` mint and metadata authorities
   were still live and publicly controllable; both were transferred to a secure wallet.
   Freeze authority was already `null` and cannot be restored — under the SPL Token
   program an authority set to null can never be re-established.
3. **Denied the attacker the residue.** The trapped balance was spent as validator fees.
   This destroyed value rather than recovering it, and was a deliberate choice.
4. **Scanned the whole estate** — 45 repositories, 3,343 commits, all branches including
   deleted files. No other leaked credential was found.
5. **Discontinued the token.** Mint authority permanently revoked; metadata repointed to
   this repository. It has no treasury, no market and no governance function, and is
   retained solely as a public record.
6. **Reported** to Chainabuse, reference
   [`7cb65dbc`](https://chainabuse.com/report/7cb65dbc-0903-4e66-9d18-16a8e5ca0047).

## Remediation still in progress

Secret scanning and push protection are now enabled across every public repository. A
repository baseline check runs over the whole estate. Collaborator agreements and a
data-handling briefing now exist and are part of onboarding. Least-privilege review of
administrative access is open.

## Not published here

The funding chain identified during the investigation is held for law enforcement and is
deliberately absent from this record. Publishing it would tell the operator that their
funding origin is known.

## Technique

The durable-nonce bricking method is documented in detail, for other victims, at
[`solana-nonce-brick`](https://github.com/Attestto-com/solana-nonce-brick). The short
version: `SystemProgram.Transfer` rejects any source account carrying data, so the key
holder can still sign but can never spend. Only `WithdrawNonceAccount`, signed by the
attacker's nonce authority, releases the funds.

If your wallet suddenly fails with `Transfer: 'from' must not carry data`, start there.
