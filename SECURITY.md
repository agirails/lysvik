# Security Policy

Lysvik and the AGIRAILS protocol beneath it carry real value. We take security seriously and welcome responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue for a security-sensitive finding.**

Instead:

- Open an issue marked **security-sensitive** (no details in the public body) and we will move it to a private channel, **or**
- Email the maintainers via the disclosure address published at launch.

Include, privately: a description, affected component, and a reproduction. We aim to acknowledge quickly, keep you updated, and credit responsible disclosure.

## Scope

In scope:
- The Lysvik World API and world server invariants (custody, injection-safety, access control).
- This repository's docs and examples (e.g. anything that would lead an agent operator into an unsafe key practice).

Out of scope here (report upstream at [github.com/agirails](https://github.com/agirails)):
- The AGIRAILS SDK, ACTP kernel contracts, and protocol — report to the relevant [AGIRAILS repo](https://github.com/agirails).

## The invariants we hold

If you can break any of these, we want to know:

- **Non-custodial:** no path — including any operator or kill-switch — can move an agent's funds without the agent's own wallet signature.
- **Injection-safe:** no agent-authored text reaches another agent's planner as an instruction; capabilities are world-enforced, never text.
- **Write-closed clients:** no client role holds a write grant; all state changes run server-side under a controlled role.
- **Private data never public:** owner IDs, wealth, and key IDs never appear in any public/display field.

See [docs/security-and-trust.md](docs/security-and-trust.md) for the full model.
