#!/usr/bin/env python3
"""The docs drift gate — a doc that reads current but describes shipped-past
behaviour must go LOUDLY stale, and a doc that describes routes the world never
served must go red the day it's written.

Truth sources it holds the docs to:
  VERSION.json                        — what the docs were verified against (the pin),
                                        and the world's current liveness status
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
      in the contract; config/*.json method+path claims are held to the same
      contract (ghost routes that fall through to SPA HTML are caught here)
  D7  served ⇒ documented: every contract route on a doc-required plane
      appears in docs/api-reference.md
  D8  canonical examples held to the served surface (verified 2026-07)
  D9  no onboarding surface hand-copies the SDK install as primary instruction
  D10 liveness rule: VERSION.json must carry world_status (live|paused); when
      paused, every doc making a NOW-reachability claim must carry the paused
      banner.  When live, no paused banners may remain.  The gate is fully
      deterministic without network — the source of truth is the committed
      world_status field, never a live probe.
  D11 LYSVIK.md generation integrity: the generated blocks in LYSVIK.md must
      match the output of scripts/generate-lysvik-md.py run against
      fixtures/catalogue-post-u1.json byte-for-byte.  Regeneration is the only
      edit path; a hand-edit of a generated block is caught here.

Run: python3 tools/docs_check.py     (from anywhere; repo-rooted; exit 1 on red)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

# D10 — patterns that assert NOW-reachability (the world is live and the door
# is open today).  Architectural claims ("a zero-balance agent CAN claim…")
# are rephrased in the docs to be timeless; these patterns catch the remainder
# that are only true while world.lysvik.app is reachable.
LIVENESS_CLAIM_RE = re.compile(
    r"door is open"                       # faq.md, README.md
    r"|world runs at\b"                   # faq.md
    r"|world is live at\b"               # quickstart.md
    r"|watch it in a browser"            # README.md
    r"|watch it live\b"                  # README.md
    r"|(?:are|is) live on Base mainnet"  # what-is-lysvik.md
    r"|https://world\.lysvik\.app/worlds/"  # raw endpoint literals
    r"|https://world\.lysvik\.app/api/",    # raw api literals
    re.I,
)
# The paused banner must contain "World paused" (case-insensitive).
PAUSED_BANNER_RE = re.compile(r"^> ⚠️.*[Ww]orld paused", re.M)

STATUSES = {"current", "stale", "superseded"}
SURFACES = {"world-api", "sdk-cli", "economy", "operator-window", "concept"}
PIN_RE = re.compile(
    r"^genesis-village@(?P<gv>[0-9a-f]{7,40}) · sdk-js@(?P<sdk>\d+\.\d+\.\d+) · arc-(?P<arc>V[\d.]+)$"
)
FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
# a path token is a route the doc is asserting exists — hold it to the contract
PATH_RE = re.compile(r"(?<![\w.])(/(?:worlds|api)/[A-Za-z0-9_/:-]+)")
# a `METHOD /path` token asserts the METHOD too — Argus F8 (2026-08-26): a doc that turned
# `GET /worlds/lysvik/board` into `DELETE …/board` stayed green under D6, which only saw the path
METHOD_PATH_RE = re.compile(r"`(GET|POST|PUT|PATCH|DELETE)\s+(/(?:worlds|api)/[A-Za-z0-9_/:-]+)[^`]*`")
# an inline secret before a command: `ACTP_KEY_PASSWORD=x cmd` — shell history keeps it (Argus F5)
INLINE_SECRET_RE = re.compile(r"^\s*ACTP_KEY_PASSWORD=\S+\s+\S", re.M)
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

    # D15 — PIN-VS-WORLD (Arha, O1 walk, S142): D3/D4 compare two COMMITTED values and by
    # construction cannot see the world move past the pin; four deploys landed in one day and
    # every live number in the README went stale together. This check is NETWORKED and therefore
    # opt-in (`--live` or DOCS_LIVE=1): GET /health .commit must equal upstream.genesis-village.
    # Atlas ruling S142: it runs as the LAST STEP of every world deploy (beside the stranger probe)
    # and at every sync pass; unreachable is RED, not skip.
    if "--live" in sys.argv or os.environ.get("DOCS_LIVE") == "1":
        try:
            import urllib.request
            with urllib.request.urlopen("https://world.lysvik.app/health", timeout=15) as r:
                live_commit = json.load(r).get("commit")
        except Exception as e:  # noqa: BLE001
            live_commit = None
            red("D15", "VERSION.json", f"the live world could not be read ({e}) — a gate that cannot see must not pass")
        if live_commit is not None and live_commit != upstream_gv:
            red("D15", "VERSION.json",
                f"the live world serves commit {live_commit} but upstream pins {upstream_gv} — the docs describe a "
                f"shipped-past world; bump upstream (and re-sync verified_against) from the deploy that moved it")
        elif live_commit is not None:
            print(f"  D15: live world commit {live_commit} == upstream {upstream_gv}")
    else:
        print("  D15: pin-vs-world NOT checked (deterministic run; pass --live or DOCS_LIVE=1 at every deploy and sync)")

    # D10 — world_status must be present in VERSION.json
    world_status = version.get("world_status")
    VALID_WORLD_STATUSES = {"live", "paused"}
    if world_status not in VALID_WORLD_STATUSES:
        red("D10", "VERSION.json",
            f"world_status is {world_status!r} — must be one of {sorted(VALID_WORLD_STATUSES)}. "
            "The gate cannot silently default to 'live'; set the field explicitly.")

    # D3 (artifact half): the committed contract must come from the pinned commit
    if contract["generated_from"] != f"genesis-village@{pinned_gv}":
        red("D3", "contracts/world-api.contract.json",
            f"generated from {contract['generated_from']}, but the pin says genesis-village@{pinned_gv}")

    routes = {(r["method"], normalize(r["path"])) for r in contract["routes"]}
    # D13 — observed routes: served by the live world (evidence in the file) but absent from the
    # generated contract at the pin. Accepted for D6/D7, printed loudly, and each must NOT also be
    # in the generated contract (a retired gap that lingers here is a lie about the generator).
    observed = json.loads((ROOT / "contracts" / "observed-routes.json").read_text())["routes"]
    for o in observed:
        key = (o["method"], normalize(o["path"]))
        if key in routes:
            red("D13", "contracts/observed-routes.json", f"{o['method']} {o['path']} is now in the generated contract — retire it here")
        if not o.get("evidence"):
            red("D13", "contracts/observed-routes.json", f"{o['method']} {o['path']} carries no evidence")
        routes.add(key)
    if observed:
        print(f"  D13: {len(observed)} OBSERVED route(s) accepted on evidence, owed to the generator: "
              + ", ".join(f"{o['method']} {o['path']}" for o in observed))
    route_paths = {normalize(r["path"]) for r in contract["routes"]} | {normalize(o["path"]) for o in observed}
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
        for method, path in {(m, normalize(p)) for m, p in METHOD_PATH_RE.findall(body)}:
            if (method, path) not in routes:
                red("D6", rel, f"documents '{method} {path}' but the contract serves no such METHOD on that route")

    # D14 — the activation script's pinned digest is cited verbatim wherever the docs tell an
    # agent to run it (Argus F1): fetched from a mutable origin, then executed holding the
    # keystore password. And no bash fence anywhere puts that password inline before a command
    # (Argus F5): shell history keeps it.
    act = version.get("activation_script") or {}
    digest = act.get("sha256", "")
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        red("D14", "VERSION.json", "activation_script.sha256 missing or not a 64-hex SHA-256")
    for md in [*sorted(DOCS.glob("*.md")), ROOT / "README.md"]:
        text = md.read_text()
        runs = ("activate-mainnet.mjs" in text and "node " in text)
        second_origin = "raw.githubusercontent.com/agirails/lysvik/main/VERSION.json" in text and "activation_script" in text and "activate-mainnet.$EXPECTED.mjs" in text
        if runs and not second_origin and digest not in text:
            red("D14", str(md.relative_to(ROOT)), "tells the agent to run activate-mainnet.mjs but teaches neither the second-origin form (EXPECTED from this repo's VERSION.json → content-addressed fetch) nor the pinned digest")
        if runs and digest[:16] not in text:
            red("D14", str(md.relative_to(ROOT)), "the pinned digest (or its first 16 hex) must appear so a reader can compare by eye")
        if re.search(r"activate-mainnet\.mjs\.sha256[^\n]*shasum", text):
            red("D14", str(md.relative_to(ROOT)), "verifies against the world's own .sha256 — same origin as the script authenticates nothing (Argus HIGH)")
        for n, block in enumerate(re.findall(r"```(?:bash|sh|shell)\n(.*?)```", text, re.S), 1):
            if INLINE_SECRET_RE.search(block):
                red("D14", str(md.relative_to(ROOT)), f"bash fence #{n} puts ACTP_KEY_PASSWORD inline before a command — read it once with read -rs and export")

    # D12 — every ```bash fence in README + docs/ must PARSE (bash -n): a stranger copies
    # these blocks; an angle-bracket placeholder is redirection syntax and the line dies
    # before it runs (found by a cold read, 2026-08-26).
    import subprocess
    fence_count = 0
    for md in [*sorted(DOCS.glob("*.md")), ROOT / "README.md"]:
        text = md.read_text()
        for n, block in enumerate(re.findall(r"```(?:bash|sh|shell)\n(.*?)```", text, re.S), 1):
            fence_count += 1
            r = subprocess.run(["bash", "-n"], input=block, text=True, capture_output=True)
            if r.returncode != 0:
                red("D12", str(md.relative_to(ROOT)), f"bash fence #{n} does not parse: {r.stderr.strip().splitlines()[-1] if r.stderr.strip() else 'bash -n failed'}")
    print(f"  D12: {fence_count} bash fences parsed")

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
        plane = next(r["plane"] for r in [*contract["routes"], *observed] if normalize(r["path"]) == path and r["method"] == method)
        if plane in contract["doc_required_planes"] and path not in api_reference_text:
            red("D7", "docs/api-reference.md", f"contract serves {method} {path} ({plane}) but the reference never mentions it")

    # D8 — the canonical examples are held to the served surface (verified 2026-07).
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

    # D9 — no onboarding surface hand-copies the SDK install (upstream maintainer).
    #
    # "I would avoid npm install instructions and direct everyone to use
    # AGIRAILS.md." He was right, and structurally so: that spec is versioned
    # and maintained upstream (OWNER:ONBOARDING_START, execution: auto), so any
    # copy of its steps here drifts silently the day the SDK changes and a
    # reader has no way to tell. Our copy also carried our own bug — network
    # selection was hand-rolled across three surfaces, which is how a TESTNET
    # publish came to precede a MAINNET join.
    #
    # WHY A GATE AND NOT A SWEEP (2026-08): the instances were removed and
    # nothing stopped the next edit reintroducing them. Third instance of that
    # class in one day — a roster count, a set of memory files, and this — and
    # in all three the instance was fixed while the class stayed open.
    # "I found the instance" is the prompt to write the scan, never the fix.
    #
    # The manual path may still be SHOWN as a fallback, which is why this
    # checks the onboarding surfaces rather than every file: it is the primary
    # instruction that must not be a hand-copy.
    # D9 (note): LYSVIK.md is also an onboarding surface — it must point at
    # AGIRAILS.md upstream rather than hand-copying install instructions.
    ONBOARDING_SURFACES = ["README.md", "AGENTS.md", "docs/quickstart.md", "LYSVIK.md"]
    NPM_INSTALL = re.compile(r"npm\s+(i|install)\s+-?g?\s*@agirails/sdk")
    for rel in ONBOARDING_SURFACES:
        p = ROOT / rel
        if not p.exists():
            continue
        src = p.read_text(encoding="utf-8")
        # Two places are legitimately NOT primary instruction and are stripped
        # before matching. Both are principled, not conveniences: a reader
        # reaches them only after choosing to, or after something has already
        # gone wrong.
        #   · a collapsed <details> fallback ("prefer to drive it yourself?")
        #   · the Troubleshooting section ("actp: command not found → install it")
        # Narrowing the rule to PRIMARY instruction is what keeps it honest;
        # a rule that also banned the recovery line would be one people learn
        # to switch off.
        primary = re.sub(r"<details>.*?</details>", "", src, flags=re.S | re.I)
        primary = re.sub(r"\n##+\s*Troubleshooting.*", "", primary, flags=re.S | re.I)
        if NPM_INSTALL.search(primary):
            red("D9", rel, "hand-copies the SDK install as a primary instruction — point at "
                           "https://www.agirails.app/protocol/AGIRAILS.md instead, or move it "
                           "inside a <details> fallback")

    # D10 — liveness rule (continued): scan docs and README for NOW-claims vs banner
    if world_status in VALID_WORLD_STATUSES:
        liveness_surfaces = [*sorted(DOCS.glob("*.md")), ROOT / "README.md"]
        for md in liveness_surfaces:
            text = md.read_text()
            # Strip the paused banner itself before scanning so the banner text
            # does not self-match the liveness-claim patterns.
            body_without_banner = PAUSED_BANNER_RE.sub("", text)
            has_liveness_claim = bool(LIVENESS_CLAIM_RE.search(body_without_banner))
            has_paused_banner = bool(PAUSED_BANNER_RE.search(text))
            rel = str(md.relative_to(ROOT))
            if world_status == "paused" and has_liveness_claim and not has_paused_banner:
                red("D10", rel,
                    "world_status=paused but this doc makes a NOW-reachability claim without "
                    "the paused banner (> ⚠️ **World paused** — …). "
                    "Add the banner or rephrase the claim to be timeless.")
            if world_status == "live" and has_paused_banner:
                red("D10", rel,
                    "world_status=live but this doc carries a 'World paused' banner — remove it.")

    # D6 (extended) — config/*.json method+path claims are held to the contract.
    # A value like "GET /api/agents" asserts that route exists; if the contract
    # only serves "POST /api/agents" (sim plane), the GET falls through to SPA
    # HTML and is a ghost route.
    CONFIG_ROUTE_RE = re.compile(
        r"^\s*(GET|POST|PUT|DELETE|PATCH|HEAD|\*)\s+(/[A-Za-z0-9_/:-]+)")

    def _extract_strings(obj):
        if isinstance(obj, str):
            yield obj
        elif isinstance(obj, dict):
            for v in obj.values():
                yield from _extract_strings(v)
        elif isinstance(obj, list):
            for item in obj:
                yield from _extract_strings(item)

    for cfg in sorted((ROOT / "config").glob("*.json")):
        rel = f"config/{cfg.name}"
        try:
            data = json.loads(cfg.read_text())
        except json.JSONDecodeError as exc:
            red("D6", rel, f"invalid JSON: {exc}")
            continue
        for val in _extract_strings(data):
            m = CONFIG_ROUTE_RE.match(val)
            if not m:
                continue
            method, path = m.group(1), normalize(m.group(2))
            if (method, path) not in routes:
                red("D6", rel,
                    f"config claims '{method} {path}' but the contract serves no such route "
                    f"(check method — a different HTTP verb may exist for this path)")

    # D11 — LYSVIK.md generation integrity.
    # The generated blocks in LYSVIK.md must match the output of
    # scripts/generate-lysvik-md.py run against fixtures/catalogue-post-u1.json.
    # Regeneration is the only valid edit path for those blocks.
    lysvik_md = ROOT / "LYSVIK.md"
    fixture_path = ROOT / "fixtures" / "catalogue-post-u1.json"
    generator = ROOT / "scripts" / "generate-lysvik-md.py"
    GEN_BLOCK_RE = re.compile(
        r"<!-- GENERATED:(\w+):START -->(.*?)<!-- GENERATED:\1:END -->",
        re.DOTALL,
    )
    if not lysvik_md.exists():
        red("D11", "LYSVIK.md", "file is missing — create it via the generator")
    elif not fixture_path.exists():
        red("D11", "fixtures/catalogue-post-u1.json",
            "fixture is missing — commit a catalogue snapshot as proof-of-mechanism")
    elif not generator.exists():
        red("D11", "scripts/generate-lysvik-md.py",
            "generator is missing — LYSVIK.md's generated blocks have no regeneration path")
    else:
        # Run the generator against the fixture and compare the generated blocks.
        try:
            result = subprocess.run(
                [sys.executable, str(generator), str(fixture_path), "--check"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                red("D11", "LYSVIK.md",
                    f"generated blocks do not match the fixture: {result.stdout.strip()}{result.stderr.strip()}")
        except subprocess.TimeoutExpired:
            red("D11", "LYSVIK.md", "generator timed out (30s)")
        except Exception as exc:
            red("D11", "LYSVIK.md", f"generator error: {exc}")

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
