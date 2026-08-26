#!/usr/bin/env python3
"""Red probes for the docs gate — every rule shown firing on the mutation it
exists to catch, plus the clean-tree green. A gate that has never been red is
a costume (CODE §9: what would this suite do if the law were broken?).

Run: python3 tools/test_docs_check.py
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
passed = failed = 0


def run_gate(tree: Path) -> tuple[int, str]:
    r = subprocess.run([sys.executable, str(tree / "tools" / "docs_check.py")],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def probe(name: str, mutate, want_rule: str | None) -> None:
    """Copy the repo's governed files to a temp tree, mutate, expect the rule."""
    global passed, failed
    with tempfile.TemporaryDirectory() as td:
        tree = Path(td)
        for part in ("docs", "tools", "contracts", "examples", "config",
                     "scripts", "fixtures"):
            src = ROOT / part
            if src.exists():
                shutil.copytree(src, tree / part)
        for f in ("VERSION.json", "README.md", "CHANGELOG.md",
                  "LYSVIK.md", "AGENTS.md",
                  ".env.example", "LICENSE"):
            src = ROOT / f
            if src.exists():
                shutil.copy(src, tree / f)
        mutate(tree)
        code, out = run_gate(tree)
        if want_rule is None:
            ok = code == 0
        else:
            ok = code == 1 and f"{want_rule} ·" in out
        if ok:
            passed += 1
            print(f"  ✓ {name}")
        else:
            failed += 1
            print(f"  ✗ {name} — exit {code}\n{out}")


def pin(t: Path) -> str:
    """The tree's OWN current pin — probes derive it so they survive every
    future sync re-pin (the fixture rotted once by hardcoding a sha)."""
    return "genesis-village@" + json.loads((t / "VERSION.json").read_text())["verified_against"]["genesis-village"]


def edit(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    assert old in text, f"probe fixture rotted: {old!r} not in {path}"
    path.write_text(text.replace(old, new, 1))


probe("clean tree is green", lambda t: None, None)

probe("D1: frontmatter stripped", lambda t: edit(
    t / "docs" / "faq.md", "---\nstatus: current", "status: current"), "D1")

probe("D1: status outside the closed set", lambda t: edit(
    t / "docs" / "faq.md", "status: current", "status: fresh"), "D1")

# D2 fixtures target a `surface: concept` doc (faq.md). D4 exempts concept docs
# from the converge stale-flip, so faq.md stays `status: current` across sync
# rituals — a surface doc rots the moment upstream moves and every non-concept
# doc flips stale (that was the S80 fixture-rot). D2 itself is surface-independent
# (docs_check.py: the banner law runs on every doc), so the probe stays valid.
probe("D2: stale without a banner", lambda t: edit(
    t / "docs" / "faq.md", "status: current", "status: stale"), "D2")


def d2_current_with_banner(t: Path) -> None:
    p = t / "docs" / "faq.md"
    text = p.read_text()
    m = re.search(r"^# .*$", text, re.M)
    p.write_text(text[: m.end()] + "\n\n> ⚠️ This page is stale.\n" + text[m.end():])


probe("D2: current wearing a stale banner", d2_current_with_banner, "D2")

probe("D3: one doc pinned to a foreign sha", lambda t: edit(
    t / "docs" / "quickstart.md", pin(t), "genesis-village@deadbee"), "D3")

probe("D3: contract generated from a different commit than the pin", lambda t: edit(
    t / "contracts" / "world-api.contract.json",
    f'"generated_from": "{pin(t)}"',
    '"generated_from": "genesis-village@deadbee"'), "D3")


def d4_upstream_moves(t: Path) -> None:
    # Establish the precondition in the test, not inherited from the rig. The
    # converge stale-flip turns EVERY non-concept doc stale, so no static doc is
    # both non-concept AND reliably current — they are exactly the ones that flip.
    # So force a known non-concept doc to a consistent current state (status
    # current, no stale banner), then move upstream past its pin: D4 must catch
    # the current-past-verification doc. Robust whether the repo's docs are
    # currently stale (today) or current again (post-L4-sync).
    ep = t / "docs" / "economy.md"
    etext = ep.read_text()
    etext = re.sub(r"^status: (?:stale|superseded)$", "status: current", etext, count=1, flags=re.M)
    etext = re.sub(r"^> ⚠️.*\n\n?", "", etext, count=1, flags=re.M)
    ep.write_text(etext)
    vp = t / "VERSION.json"
    v = json.loads(vp.read_text())
    v["upstream"]["genesis-village"] = "abc1234"
    vp.write_text(json.dumps(v, indent=2))


probe("D4: upstream moved, non-concept docs still claim current", d4_upstream_moves, "D4")

probe("D5: dead relative link", lambda t: edit(
    t / "docs" / "quickstart.md", "(how-to-play.md)", "(no-such-doc.md)"), "D5")

probe("D6: a ghost route enters the reference", lambda t: edit(
    t / "docs" / "api-reference.md", "| `GET /api/state`", "| `GET /api/ghosts` | spooky |\n| `GET /api/state`"), "D6")

probe("D7: a served public route vanishes from the reference", lambda t: edit(
    t / "docs" / "api-reference.md", "/worlds/lysvik/rail", "/worlds/lysvik/ra_il"), "D7")


# ── D10 probes ───────────────────────────────────────────────────────────────

def d10_missing_world_status(t: Path) -> None:
    vp = t / "VERSION.json"
    v = json.loads(vp.read_text())
    del v["world_status"]
    vp.write_text(json.dumps(v, indent=2))


probe("D10: world_status absent from VERSION.json", d10_missing_world_status, "D10")


def d10_invalid_world_status(t: Path) -> None:
    vp = t / "VERSION.json"
    v = json.loads(vp.read_text())
    v["world_status"] = "unknown"
    vp.write_text(json.dumps(v, indent=2))


probe("D10: world_status set to invalid value", d10_invalid_world_status, "D10")


def d10_paused_without_banner(t: Path) -> None:
    """Set world_status=paused and strip the paused banner from a doc that has one."""
    vp = t / "VERSION.json"
    v = json.loads(vp.read_text())
    v["world_status"] = "paused"
    vp.write_text(json.dumps(v, indent=2))
    # Strip the paused banner from faq.md (it has a liveness claim + banner)
    p = t / "docs" / "faq.md"
    text = p.read_text()
    text = re.sub(r"^> ⚠️ \*\*World paused\*\*.*\n\n?", "", text, flags=re.M)
    p.write_text(text)


probe("D10: world_status=paused but doc with liveness claim has no paused banner",
      d10_paused_without_banner, "D10")


def d10_live_with_paused_banner(t: Path) -> None:
    """Set world_status=live but leave a paused banner in a doc."""
    vp = t / "VERSION.json"
    v = json.loads(vp.read_text())
    v["world_status"] = "live"
    vp.write_text(json.dumps(v, indent=2))
    # Add a paused banner to quickstart.md (which won't have one when world is live)
    p = t / "docs" / "quickstart.md"
    text = p.read_text()
    # Inject after the title
    m = re.search(r"^# ", text, re.M)
    p.write_text(text[:m.end()] + "Quickstart\n\n> ⚠️ **World paused** — test.\n" + text[m.end():])


probe("D10: world_status=live but doc carries a paused banner", d10_live_with_paused_banner, "D10")


# ── D6-config probe ──────────────────────────────────────────────────────────

def d6_config_ghost_route(t: Path) -> None:
    """Inject a ghost GET route into config/endpoints.example.json."""
    p = t / "config" / "endpoints.example.json"
    data = json.loads(p.read_text())
    # Inject a GET for a path that only exists as POST in the contract
    data["world"]["spectator"]["ghost"] = "GET /api/agents"
    p.write_text(json.dumps(data, indent=2))


probe("D6: ghost route in config/endpoints.example.json", d6_config_ghost_route, "D6")


# ── D11 probes ───────────────────────────────────────────────────────────────

def d11_lysvik_md_missing(t: Path) -> None:
    (t / "LYSVIK.md").unlink()


probe("D11: LYSVIK.md missing", d11_lysvik_md_missing, "D11")


def d11_generated_block_hand_edited(t: Path) -> None:
    """Hand-edit a GENERATED block in LYSVIK.md."""
    p = t / "LYSVIK.md"
    text = p.read_text()
    # Corrupt the actions block
    text = text.replace(
        "- `idle`",
        "- `idle`\n- `invented_action_that_does_not_exist`",
        1,
    )
    p.write_text(text)


probe("D11: generated block hand-edited in LYSVIK.md", d11_generated_block_hand_edited, "D11")


def d11_fixture_missing(t: Path) -> None:
    import shutil as _sh
    _sh.rmtree(t / "fixtures")


probe("D11: fixtures directory missing", d11_fixture_missing, "D11")


# ── Argus audit, 2026-08-26: F8 (method-aware D6), F1/F5 (D14), observed routes (D13) ──
def _sub(path, old, new):
    t = path.read_text(); assert old in t, (path, old[:40]); path.write_text(t.replace(old, new, 1))

def d6_method_mutation(t: Path) -> None:
    _sub(t / "docs" / "api-reference.md", '`GET  /worlds/lysvik/board', '`DELETE  /worlds/lysvik/board')

def d14_digest_dropped(t: Path) -> None:
    v = json.loads((t / "VERSION.json").read_text()); v["activation_script"]["sha256"] = "0" * 64
    (t / "VERSION.json").write_text(json.dumps(v, indent=2))

def d14_inline_secret(t: Path) -> None:
    _sub(t / "docs" / "quickstart.md", "npx actp publish  ", "ACTP_KEY_PASSWORD=hunter2 npx actp publish  ")

def d13_observed_now_generated(t: Path) -> None:
    c = json.loads((t / "contracts" / "world-api.contract.json").read_text())
    c["routes"].append({"method": "POST", "path": "/worlds/lysvik/agents/:id/session", "plane": "agent"})
    (t / "contracts" / "world-api.contract.json").write_text(json.dumps(c, indent=2))

probe("D6: documented METHOD not served (GET board → DELETE board)", d6_method_mutation, "D6")
probe("D14: pinned activation digest changes and the docs still cite the old one", d14_digest_dropped, "D14")
probe("D14: ACTP_KEY_PASSWORD inline before a command in a bash fence", d14_inline_secret, "D14")
probe("D13: an observed route that the generated contract now carries", d13_observed_now_generated, "D13")

def d6_observed_post_session_removed(t: Path) -> None:
    o = json.loads((t / "contracts" / "observed-routes.json").read_text()); o["routes"] = []
    (t / "contracts" / "observed-routes.json").write_text(json.dumps(o, indent=2))

probe("D6: POST /agents/:id/session withdrawn from observed routes — the reference's `POST …/session` goes red", d6_observed_post_session_removed, "D6")


print(f"\n{'PASS' if failed == 0 else 'FAIL'} — {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
