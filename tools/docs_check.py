#!/usr/bin/env python3
"""The docs drift gate — a doc that reads current but describes shipped-past
behaviour must go LOUDLY stale, and a doc that describes routes the world never
served must go red the day it's written.

Truth sources it holds the docs to:
  VERSION.json                        — what the docs were verified against (the pin)
  contracts/world-api.contract.json   — the served surface, generated + proven
                                        from genesis-village source (its gate
                                        keeps it fresh; we keep a committed copy)

Rules (each failure names its rule):
  D1  every docs/*.md carries frontmatter: status/surface/verified-against,
      all three from closed vocabularies
  D2  banner law: stale|superseded ⇔ a `> ⚠️` banner naming it; current docs
      carry none
  D3  pin agreement: every doc's pin == VERSION.json's verified_against, and
      the contract artifact was generated from that same commit
  D4  the stale flip: when upstream moves past verified_against, every
      non-concept doc must be status: stale (re-verify to flip back)
  D5  relative links resolve (docs/*.md + README.md)
  D6  documented ⇒ served: every /worlds/… or /api/… path in the docs exists
      in the contract
  D7  served ⇒ documented: every contract route on a doc-required plane
      appears in docs/api-reference.md

Run: python3 tools/docs_check.py     (from anywhere; repo-rooted; exit 1 on red)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

STATUSES = {"current", "stale", "superseded"}
SURFACES = {"world-api", "sdk-cli", "economy", "operator-window", "concept"}
PIN_RE = re.compile(
    r"^genesis-village@(?P<gv>[0-9a-f]{7,40}) · sdk-js@(?P<sdk>\d+\.\d+\.\d+) · arc-(?P<arc>V[\d.]+)$"
)
FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
# a path token is a route the doc is asserting exists — hold it to the contract
PATH_RE = re.compile(r"(?<![\w.])(/(?:worlds|api)/[A-Za-z0-9_/:-]+)")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)#\s]+)(?:#[^)\s]*)?\)")

violations: list[str] = []


def red(rule: str, where: str, msg: str) -> None:
    violations.append(f"  {rule} · {where}: {msg}")


def parse_frontmatter(text: str) -> dict[str, str] | None:
    m = FRONT_RE.match(text)
    if not m:
        return None
    fields: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip()] = v.strip()
    return fields


def normalize(path: str) -> str:
    return path.rstrip("/.")


def main() -> int:
    version = json.loads((ROOT / "VERSION.json").read_text())
    contract = json.loads((ROOT / "contracts" / "world-api.contract.json").read_text())
    pinned_gv = version["verified_against"]["genesis-village"]
    pinned_sdk = version["verified_against"]["sdk-js"]
    upstream_gv = version["upstream"]["genesis-village"]

    # D3 (artifact half): the committed contract must come from the pinned commit
    if contract["generated_from"] != f"genesis-village@{pinned_gv}":
        red("D3", "contracts/world-api.contract.json",
            f"generated from {contract['generated_from']}, but the pin says genesis-village@{pinned_gv}")

    routes = {(r["method"], normalize(r["path"])) for r in contract["routes"]}
    route_paths = {normalize(r["path"]) for r in contract["routes"]}
    upstream_moved = upstream_gv != pinned_gv

    api_reference_text = ""
    for doc in sorted(DOCS.glob("*.md")):
        rel = f"docs/{doc.name}"
        text = doc.read_text()
        fm = parse_frontmatter(text)
        body = FRONT_RE.sub("", text, count=1)
        if doc.name == "api-reference.md":
            api_reference_text = body

        # D1 — frontmatter, closed vocabularies
        if fm is None:
            red("D1", rel, "no frontmatter (status/surface/verified-against required)")
            continue
        status, surface, pin = fm.get("status"), fm.get("surface"), fm.get("verified-against")
        if status not in STATUSES:
            red("D1", rel, f"status '{status}' not in {sorted(STATUSES)}")
        if surface not in SURFACES:
            red("D1", rel, f"surface '{surface}' not in {sorted(SURFACES)}")
        pm = PIN_RE.match(pin or "")
        if not pm:
            red("D1", rel, f"verified-against '{pin}' doesn't match 'genesis-village@<sha> · sdk-js@<x.y.z> · arc-V<n>'")

        # D2 — the banner law, both directions
        bannered = any(line.startswith("> ⚠️") and re.search(r"stale|superseded", line, re.I)
                       for line in body.splitlines())
        if status in {"stale", "superseded"} and not bannered:
            red("D2", rel, f"status: {status} but no '> ⚠️ …{status}…' banner — staleness must be loud")
        if status == "current" and bannered:
            red("D2", rel, "status: current but carries a stale/superseded banner — one of them is lying")

        # D3 — pin agreement with VERSION.json
        if pm and (pm.group("gv") != pinned_gv or pm.group("sdk") != pinned_sdk):
            red("D3", rel, f"pin {pin} != VERSION.json ({pinned_gv} / {pinned_sdk})")

        # D4 — the stale flip
        if upstream_moved and surface != "concept" and status == "current":
            red("D4", rel, f"upstream is genesis-village@{upstream_gv} but the pin is {pinned_gv} — "
                           "a non-concept doc can't claim current past its verification; flip to stale or re-verify")

        # D6 — documented ⇒ served
        for token in {normalize(t) for t in PATH_RE.findall(body)}:
            if token not in route_paths:
                red("D6", rel, f"documents '{token}' but the contract serves no such route")

    # D5 — relative links resolve
    for md in [*sorted(DOCS.glob("*.md")), ROOT / "README.md"]:
        base = md.parent
        for target in LINK_RE.findall(md.read_text()):
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            if not (base / target).resolve().exists():
                red("D5", str(md.relative_to(ROOT)), f"dead link: {target}")

    # D7 — served ⇒ documented (the reference holds the full promised surface)
    for method, path in sorted(routes):
        plane = next(r["plane"] for r in contract["routes"] if normalize(r["path"]) == path and r["method"] == method)
        if plane in contract["doc_required_planes"] and path not in api_reference_text:
            red("D7", "docs/api-reference.md", f"contract serves {method} {path} ({plane}) but the reference never mentions it")

    # D8 — the canonical examples are held to the served surface (S100).
    # examples/heartbeat.ts was labelled "don't improvise it" and drifted six
    # ways from the world it described — a dead route, a missing required
    # field, phantom feed fields, a testnet default against a mainnet world —
    # because no rule read the examples at all. Now the same law as D6, plus
    # the specific traps that bit, and the smoke that must keep existing:
    for ex in sorted((ROOT / "examples").glob("*.ts")):
        rel = f"examples/{ex.name}"
        src = ex.read_text()
        # every route literal must be served (any ${…} template segment is a
        # path parameter — normalize to the contract's :id form)
        for token in {normalize(t) for t in PATH_RE.findall(re.sub(r"\$\{[^}]+\}", ":id", src))}:
            if token not in route_paths:
                red("D8", rel, f"uses '{token}' but the contract serves no such route")
        # the phantom feed fields that killed the old catch-up loop
        for phantom in ("reply_to_author_id", "unreplied"):
            if phantom in src:
                red("D8", rel, f"reads '{phantom}' — the board has never served it; derive from author_id + reply_to")
        # no chain default: an example must never pick a network for the reader
        if re.search(r"\?\?\s*'(testnet|mainnet|mock)'", src):
            red("D8", rel, "defaults ACTP mode — the mode must be explicit and match the door's chain_id, never a fallback")
    if not (ROOT / "examples" / "heartbeat.smoke.mjs").exists():
        red("D8", "examples/heartbeat.smoke.mjs", "the canonical loop's fixture smoke is missing — the executable half of 'don't improvise it'")

    if violations:
        print(f"docs gate RED — {len(violations)} violation(s):")
        print("\n".join(violations))
        return 1
    n_docs = len(list(DOCS.glob("*.md")))
    print(f"docs gate green: {n_docs} docs · pin genesis-village@{pinned_gv} · sdk-js@{pinned_sdk} · "
          f"{len(routes)} contract routes checked both directions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
