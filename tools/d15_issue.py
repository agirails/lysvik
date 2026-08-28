#!/usr/bin/env python3
"""D15 off-box convergence — issue manager.

Idempotent: one open marker issue at most.
- RED: if a marker issue is open, add a comment with the run URL + both commit values;
       if not, open one (title carries both values; body carries the marker + denominator).
- GREEN: if a marker issue is open, add a comment with both values and close it.

The dedupe key is the exact marker string in the issue body — never title-match.
Unit-testable pure functions: find_marker_issue(), extract_values().

Usage (from .github/workflows/d15-convergence.yml):
  env:
    GH_TOKEN:            ${{ secrets.GITHUB_TOKEN }}
    GATE_EXIT:           ${{ steps.gate.outputs.gate_exit }}
    RUN_URL:             ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    GITHUB_REPOSITORY:   ${{ github.repository }}
  run: python3 tools/d15_issue.py gate_output.txt
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

MARKER = "<!-- d15-convergence-marker -->"
DENOMINATOR = (
    "Measured per run, every 30 minutes; "
    "a divergence is visible within 30 minutes of a world push."
)


# ── pure functions (unit-testable without network) ───────────────────────────

def find_marker_issue(issues: list[dict]) -> dict | None:
    """Return the first issue in `issues` whose body contains MARKER, or None."""
    for issue in issues:
        if MARKER in (issue.get("body") or ""):
            return issue
    return None


def extract_values(output: str) -> tuple[str | None, str | None]:
    """Parse gate output for live_commit and docs_pin.

    Handles the D15 green form:
      D15: live world commit <sha> == upstream <sha>
    and the D15 red (mismatch) form:
      the live world serves commit <sha> but upstream pins <sha>
    Returns (None, None) for unreachable / unrecognised output.
    """
    m = re.search(r"D15: live world commit (\S+) == upstream (\S+)", output)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r"live world serves commit (\S+) but upstream pins (\S+)", output)
    if m:
        return m.group(1), m.group(2)
    return None, None


# ── GitHub REST helpers ───────────────────────────────────────────────────────

def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }


def _get(url: str, token: str) -> list | dict:
    req = urllib.request.Request(url, headers=_headers(token))
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _post(url: str, data: dict, token: str) -> dict:
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers(token), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def _patch(url: str, data: dict, token: str) -> dict:
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers(token), method="PATCH")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    gate_exit = int(os.environ.get("GATE_EXIT", "1"))
    run_url = os.environ.get("RUN_URL", "(run URL not set)")
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "agirails/lysvik")

    output = ""
    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        if p.exists():
            output = p.read_text()

    live_commit, docs_pin = extract_values(output)
    values_line = (
        f"- live world commit: `{live_commit or 'unknown (unreachable or parse error)'}`\n"
        f"- docs pin (upstream): `{docs_pin or 'unknown'}`"
    )

    if not token:
        print("d15_issue: GH_TOKEN not set — skipping issue management", file=sys.stderr)
        return 0

    api_base = f"https://api.github.com/repos/{repo}"

    try:
        open_issues = _get(f"{api_base}/issues?state=open&per_page=100", token)
    except urllib.error.URLError as e:
        print(f"d15_issue: could not list issues: {e}", file=sys.stderr)
        return 1

    existing = find_marker_issue(open_issues if isinstance(open_issues, list) else [])

    if gate_exit != 0:
        # RED — open or update the marker issue
        issue_label = f"`{live_commit or 'unreachable'}` != `{docs_pin or 'unknown'}`"
        if existing:
            comment = (
                f"**D15 still RED** — run {run_url}\n\n"
                f"{values_line}"
            )
            _post(f"{api_base}/issues/{existing['number']}/comments", {"body": comment}, token)
            print(f"d15_issue: commented on existing issue #{existing['number']}")
        else:
            title = f"D15 RED: world {live_commit or 'unreachable'} != docs {docs_pin or 'unknown'}"
            body = (
                f"{MARKER}\n\n"
                f"The off-box D15 convergence check went RED.\n\n"
                f"{values_line}\n\n"
                f"Run: {run_url}\n\n"
                f"{DENOMINATOR}"
            )
            new_issue = _post(f"{api_base}/issues", {"title": title, "body": body}, token)
            print(f"d15_issue: opened issue #{new_issue['number']}: {new_issue['html_url']}")
    else:
        # GREEN — close the marker issue if open
        if existing:
            comment = (
                f"**D15 GREEN** — convergence confirmed. Run: {run_url}\n\n"
                f"{values_line}"
            )
            _post(f"{api_base}/issues/{existing['number']}/comments", {"body": comment}, token)
            _patch(f"{api_base}/issues/{existing['number']}", {"state": "closed"}, token)
            print(f"d15_issue: closed issue #{existing['number']}")
        else:
            print("d15_issue: green and no open marker issue — nothing to do")

    return 0


if __name__ == "__main__":
    sys.exit(main())
