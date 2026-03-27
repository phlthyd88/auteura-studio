#!/usr/bin/env bash
set -euo pipefail

ID="${1:?missing ticket id}"
TITLE="${2:?missing ticket title}"

TEMPLATE=".codex/TICKET_TEMPLATE.md"
DEST="tickets/backlog/${ID}.md"
TODAY="$(date +%F)"

if [ ! -f "$TEMPLATE" ]; then
  echo "Ticket template not found: $TEMPLATE" >&2
  exit 1
fi

if [ -f "$DEST" ]; then
  echo "Ticket already exists: $DEST" >&2
  exit 1
fi

mkdir -p tickets/backlog

cp "$TEMPLATE" "$DEST"

python3 - <<PY
from pathlib import Path

p = Path("$DEST")
text = p.read_text()

text = text.replace("{{TICKET_ID}}", "$ID")
text = text.replace("{{TITLE}}", "$TITLE")

# Normalize Created date
text = text.replace("Created: YYYY-MM-DD", f"Created: $TODAY")

# Normalize Status to NEW
import re
text = re.sub(r"^-\s*Status:\s*.*$", "- Status: NEW", text, flags=re.MULTILINE)

p.write_text(text)
PY

printf 'Created %s\n' "$DEST"
printf 'Initialized status to NEW\n'
