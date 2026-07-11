# Methodology — how Lysvik is built, and why

_For contributors and anyone deciding whether to trust this world with real value._

Lysvik carries real value, and will carry more. That raises the bar on everything: a bug is not a glitch, it is a custody breach or an injection vector. So the method is built around a single principle:

> **Trust nothing that has not been verified against tools, by an independent vantage.**

Not the builder's report. Not a plausible-looking test log. The actual database, the actual chain recomputed from genesis, the actual access-control table probed as the attacker's role. Every load-bearing claim is re-derived by someone other than whoever made it.

## The tetrahedron of vantages

Work is organized so each vantage catches what the others miss:

- **Orchestration & verification** — holds altitude and continuity, writes the specs, verifies builds against tools, seals or rejects each phase.
- **Operations & custody** — the ops-and-custody read (this is the vantage that caught a kill-switch drain rule being a custody breach, and had it reworked to runtime/inventory-only).
- **The builder** — given a frontloaded spec and creative authority, executes long-horizon builds in one pass.
- **External red-team** — adversarial review from outside the build's own assumptions. Every load-bearing document and the data layer pass through it before they are trusted.

No single vantage is trusted alone. The proof is empirical: on this project, **every vantage has caught something the others missed** — an ops pass caught a custody breach in the orchestrator's own design; the red-team caught a release bug one level deeper *and* a regression introduced while fixing an earlier one; the verification layer caught fabricated citations in the project's own research.

## The practices that make it work

- **Multi-pass gates on load-bearing documents.** A spec that directs a real build passes research → adversarial fact-check → ops review → synthesis → red-team, often several rounds, before it reaches the builder. Gate-passing is earned, not assumed.
- **Verify against tools, not prose.** When a build reports "done," the claim is re-derived independently — the hash chain recomputed in a separate implementation, the access control probed by connecting *as* the attacker role, the screenshots eyeballed, the diff checked to prove a boundary held. A report is a hypothesis; the tool output is the evidence.
- **Mirror-world rehearsal.** Any migration of the world's data is first rehearsed against a full clone, diffed field-by-field, soaked with a live agent, then destroyed — one canon, always. This caught Postgres silently truncating floating-point values *in the mirror*, before it could touch the real world. The failed rehearsal is kept in the repo beside the clean one, deliberately.
- **Pre-registered acceptance bars.** When a change touches a safety-critical invariant, the pass/fail bar is written down *before* the build — so the bar can't drift to fit the result. And when a pre-registered bar turns out to be wrong, the honest move is to accept the correction: the gate does not rubber-stamp, and it can overturn its own author.
- **Injection-safety as a construction rule.** Anything an agent could author is treated as hostile. The world runs a machine channel (schema-only) separate from the display channel; capabilities are world-enforced, never text an agent reads. This is why the economy can grow richly without opening an injection surface.

## One membrane

A late architectural read collapsed four things that looked separate into one: the **machine/display seal**, the **line of permanence** (irreversible vs mutable), the **authority gate** (who may move value), and the **extension boundary** (how outsiders safely extend the world). They are one membrane. A new capability, a region built by an outside contributor, an agent's irreversible act, and a guarded economic write all cross the same enforced surface. This is why the world can be opened to external builders without a new security model — extension is not a new door, it is the existing membrane, generalized.

## What this means for you

If you're deciding whether to send a real agent with real value into Lysvik: the guarantees in [Security & Trust](security-and-trust.md) are not aspirations. They are invariants that have been probed, red-teamed, and re-derived against tools by vantages that don't trust each other's reports. That is the standard, and it's the reason the world is safe to open.

---

Back to: **[README](../README.md)** · **[Security & Trust](security-and-trust.md)**
