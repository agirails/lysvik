#!/usr/bin/env python3
"""Generate the GENERATED blocks in LYSVIK.md from a catalogue fixture JSON.

Usage:
  python3 scripts/generate-lysvik-md.py <fixture.json>          # regenerate in place
  python3 scripts/generate-lysvik-md.py <fixture.json> --check  # exit 1 if LYSVIK.md differs

The generator owns only the content between:
  <!-- GENERATED:<key>:START --> ... <!-- GENERATED:<key>:END -->

All prose outside those markers is human-authored and untouched by regeneration.

D11 in tools/docs_check.py calls this script with --check.  Hand-edits inside a
GENERATED block are a D11 violation; regeneration is the only edit path.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LYSVIK_MD = ROOT / "LYSVIK.md"

BLOCK_RE = re.compile(
    r"(<!-- GENERATED:(?P<key>\w+):START -->).*?(<!-- GENERATED:(?P=key):END -->)",
    re.DOTALL,
)


def render_actions(data: dict) -> str:
    """Render the actions block: full closed action vocabulary."""
    actions = data.get("actions", [])
    lines = [
        "The following action verbs are the world's closed vocabulary.",
        "POST `action` values outside this list are refused with `UNKNOWN_ACTION`.",
        "",
    ]
    for a in sorted(actions):
        lines.append(f"- `{a}`")
    return "\n".join(lines) + "\n"


def render_available(data: dict) -> str:
    """Render the always_available block: verbs that are always in catalogue.available."""
    always = data.get("always_available", [])
    lines = [
        "These verbs are always present in `catalogue.available` regardless of agent state.",
        "Additional verbs appear when proximity, progress, or board state unlocks them.",
        "See `GET /worlds/lysvik/catalogue` for the full contextual set.",
        "",
    ]
    for item in always:
        lines.append(f"- **`{item['action']}`** — {item['summary']}")
    return "\n".join(lines) + "\n"


def render_enums(data: dict) -> str:
    """Render the enums block: closed vocabularies."""
    enums = data.get("enums", {})
    lines = []
    for name, values in sorted(enums.items()):
        lines.append(f"**`{name}`:** " + ", ".join(f"`{v}`" for v in values))
    if not lines:
        lines.append("*(no enums in this fixture)*")
    return "\n".join(lines) + "\n"


def render_membrane(data: dict) -> str:
    """Render the membrane block (placeholder until U1 extends the catalogue)."""
    m = data.get("membrane")
    if m is None:
        note = data.get("_membrane_note", "")
        return f"<!-- placeholder — {note} -->\n*(membrane bounds will be populated from the served catalogue post-U1)*\n"
    # When membrane is populated, render its fields here.
    return json.dumps(m, indent=2) + "\n"


def render_sleep(data: dict) -> str:
    """Render the sleep block (placeholder until U1 extends the catalogue)."""
    s = data.get("sleep_shape")
    if s is None:
        note = data.get("_sleep_shape_note", "")
        return f"<!-- placeholder — {note} -->\n*(sleep/wake/catch-up loop parameters will be populated from the served catalogue post-U1)*\n"
    return json.dumps(s, indent=2) + "\n"


RENDERERS = {
    "actions": render_actions,
    "available": render_available,
    "enums": render_enums,
    "membrane": render_membrane,
    "sleep": render_sleep,
}


def generate_blocks(data: dict) -> dict[str, str]:
    """Return a dict of key -> rendered content (without the markers)."""
    return {key: fn(data) for key, fn in RENDERERS.items()}


def splice(source: str, blocks: dict[str, str]) -> str:
    """Replace each GENERATED block's content with the rendered version."""
    def _replace(m: re.Match) -> str:
        key = m.group("key")
        open_tag = m.group(1)
        close_tag = m.group(3)
        content = blocks.get(key)
        if content is None:
            return m.group(0)  # unknown key: leave unchanged
        return f"{open_tag}\n{content}{close_tag}"

    return BLOCK_RE.sub(_replace, source)


def main() -> int:
    args = sys.argv[1:]
    check_mode = "--check" in args
    positional = [a for a in args if not a.startswith("--")]

    if not positional:
        print(f"usage: {sys.argv[0]} <fixture.json> [--check]", file=sys.stderr)
        return 2

    fixture_path = Path(positional[0])
    if not fixture_path.exists():
        print(f"fixture not found: {fixture_path}", file=sys.stderr)
        return 2

    data = json.loads(fixture_path.read_text())
    blocks = generate_blocks(data)

    if not LYSVIK_MD.exists():
        if check_mode:
            print("LYSVIK.md does not exist", file=sys.stderr)
            return 1
        print("LYSVIK.md does not exist; nothing to regenerate (run without --check to create it)",
              file=sys.stderr)
        return 2

    current = LYSVIK_MD.read_text()
    regenerated = splice(current, blocks)

    if check_mode:
        if current == regenerated:
            return 0
        # Show which blocks differ.
        current_blocks = {m.group("key"): m.group(0) for m in BLOCK_RE.finditer(current)}
        regen_blocks = {m.group("key"): m.group(0) for m in BLOCK_RE.finditer(regenerated)}
        for key in sorted(set(current_blocks) | set(regen_blocks)):
            if current_blocks.get(key) != regen_blocks.get(key):
                print(f"  block '{key}' differs — hand-edit detected or fixture changed; "
                      "regenerate with: python3 scripts/generate-lysvik-md.py "
                      f"fixtures/catalogue-pre-u1.json")
        return 1

    LYSVIK_MD.write_text(regenerated)
    meta = data.get("_meta", {})
    src = meta.get("generated_from", fixture_path.name)
    print(f"LYSVIK.md regenerated from {src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
