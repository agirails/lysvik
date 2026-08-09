# README external-agent claim — before/after (S115)

Justin decides whether this draft replaces the current text. Do not merge
without his word — S113 deliberately restored the current claim after a prior
removal, so this is a live ruling, not a cleanup.

---

## BEFORE (current live text, README.md:45–53)

```markdown
> **🟠 Status: active development — a working prototype, live on Base mainnet.**
> The world runs at **[world.lysvik.app](https://world.lysvik.app)** — watch it in a browser right now, no account, no wallet. The door is open to agents: joining is a **wallet-signed EIP-712 join** (no API keys, no sign-up — your on-chain identity *is* the credential).
>
> **What is proven:** the rail works end to end. The **first external agents — Atlas and Nex — walked in through the signed door** and settled **real USDC agent-to-agent** on Base, with the village rendering the observed transaction. That is the whole thesis, demonstrated. **One settlement so far, and both agents are our own** — the population is small and the work board is often empty. The next name on the gueststone should be yours.
>
> **What to expect:** rough edges. The world takes a while to load and is heavy on older machines; the spectator view needs a desktop browser today. Come early and shape it.
>
> Early world, real money: read [Wallet & Key Ownership](docs/wallet-and-key-ownership.md) before mainnet keys go anywhere.
```

---

## AFTER (Arha's honest version — per S115 brief)

Key changes:
- States both agents share a common funding wallet (not independently funded external parties)
- Adds the `distinct_controllers` upper-bound honesty from `worldApi.ts:949–954`
- Makes the invitation line explicit: "our own two seed agents settled first; the next name on the gueststone should be yours"
- Removes "external agents" framing since both agents are ours

```markdown
> **🟠 Status: active development — a working prototype, live on Base mainnet.**
> The world runs at **[world.lysvik.app](https://world.lysvik.app)** (see the status banner above for current reachability). The door accepts agents via a **wallet-signed EIP-712 join** (no API keys, no sign-up — your on-chain identity *is* the credential).
>
> **What is proven:** the rail works end to end. Our own two seed agents — Atlas and Nex — walked in through the signed door and settled **real USDC agent-to-agent** on Base, with the village rendering the observed transaction. **One settlement so far; both agents share a common funding wallet** (`distinct_controllers: 1` on the rail — an upper bound on independent parties, not proof of independence, as the proof header states; see `server/worldApi.ts:949–954`). That counts as one demonstration of the mechanism. **Our own two seed agents settled first; the next name on the gueststone should be yours.**
>
> **What to expect:** rough edges. The world takes a while to load and is heavy on older machines; the spectator view needs a desktop browser today. Come early and shape it.
>
> Early world, real money: read [Wallet & Key Ownership](docs/wallet-and-key-ownership.md) before mainnet keys go anywhere.
```

---

## Rationale

The current text says "first external agents — Atlas and Nex". Both agents are
ours (Justin's). The word "external" was added in S113 after Atlas/Nex are
wallet-bound identities separate from the operator, which is technically true —
but the plain reading is "agents from outside our team", which is false.

Arha's ask (per S115 brief):
1. **One settlement (singular)** — already correct.
2. **Both agents funded by a common wallet** — adds this honesty; the
   `distinct_controllers` field in `/api/econ` reflects this as 1.
3. **distinct_controllers upper-bound honesty** — `worldApi.ts:952–954` already
   states "an upper bound on independent parties, never proof of independence
   (linked wallets read as distinct)"; the README draft exposes this to readers.
4. **Invitation line** — "our own two seed agents settled first; the next name
   on the gueststone should be yours."

The current text stays live until Justin's word.
