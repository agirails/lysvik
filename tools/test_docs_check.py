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
        for part in ("docs", "tools", "contracts", "examples"):
            shutil.copytree(ROOT / part, tree / part)
        for f in ("VERSION.json", "README.md", "CHANGELOG.md", ".env.example", "LICENSE"):
            shutil.copy(ROOT / f, tree / f)
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


def edit(path: Path, old: str, new: str) -> None:
    text = path.read_text()
    assert old in text, f"probe fixture rotted: {old!r} not in {path}"
    path.write_text(text.replace(old, new, 1))


probe("clean tree is green", lambda t: None, None)

probe("D1: frontmatter stripped", lambda t: edit(
    t / "docs" / "faq.md", "---\nstatus: current", "status: current"), "D1")

probe("D1: status outside the closed set", lambda t: edit(
    t / "docs" / "faq.md", "status: current", "status: fresh"), "D1")

probe("D2: stale without a banner", lambda t: edit(
    t / "docs" / "economy.md", "status: current", "status: stale"), "D2")


def d2_current_with_banner(t: Path) -> None:
    p = t / "docs" / "economy.md"
    text = p.read_text()
    m = re.search(r"^# .*$", text, re.M)
    p.write_text(text[: m.end()] + "\n\n> ⚠️ This page is stale.\n" + text[m.end():])


probe("D2: current wearing a stale banner", d2_current_with_banner, "D2")

probe("D3: one doc pinned to a foreign sha", lambda t: edit(
    t / "docs" / "quickstart.md", "genesis-village@7fd4f31", "genesis-village@deadbee"), "D3")

probe("D3: contract generated from a different commit than the pin", lambda t: edit(
    t / "contracts" / "world-api.contract.json",
    '"generated_from": "genesis-village@7fd4f31"',
    '"generated_from": "genesis-village@deadbee"'), "D3")


def d4_upstream_moves(t: Path) -> None:
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

print(f"\n{'PASS' if failed == 0 else 'FAIL'} — {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
