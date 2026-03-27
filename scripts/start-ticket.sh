#!/usr/bin/env bash
set -euo pipefail

TICKET="${1:?missing ticket path}"

if [ ! -f "$TICKET" ]; then
  echo "Ticket not found: $TICKET" >&2
  exit 1
fi

case "$TICKET" in
  tickets/backlog/*) ;;
  *)
    echo "triage-ticket.sh only operates on tickets in tickets/backlog/" >&2
    exit 1
    ;;
esac

CURRENT_STATUS="$(grep '^- Status:' "$TICKET" | sed 's/^- Status: //' || true)"

if [ -z "$CURRENT_STATUS" ]; then
  echo "No '- Status:' field found in $TICKET" >&2
  exit 1
fi

case "$CURRENT_STATUS" in
  NEW)
    sed -i 's/^- Status: NEW$/- Status: TRIAGED/' "$TICKET"
    printf 'Triaged %s\n' "$TICKET"
    printf 'Updated status to TRIAGED\n'
    ;;
  TRIAGED)
    printf 'Ticket already TRIAGED: %s\n' "$TICKET"
    ;;
  *)
    echo "Cannot triage ticket with current status: $CURRENT_STATUS" >&2
    exit 1
    ;;
esac
