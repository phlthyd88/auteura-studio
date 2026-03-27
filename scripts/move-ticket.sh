#!/usr/bin/env bash
set -euo pipefail

FROM="${1:?missing source ticket path}"
TO="${2:?missing destination folder}"
STATUS_OVERRIDE="${3:-}"

case "$TO" in
  backlog|in-progress|blocked|review|done) ;;
  *)
    echo "Invalid destination: $TO" >&2
    echo "Valid destinations: backlog, in-progress, blocked, review, done" >&2
    exit 1
    ;;
esac

if [ ! -f "$FROM" ]; then
  echo "Source ticket not found: $FROM" >&2
  exit 1
fi

BASENAME="$(basename "$FROM")"
DEST="tickets/${TO}/${BASENAME}"

case "$TO" in
  in-progress)
    TARGET_STATUS="IN_PROGRESS"
    ;;
  blocked)
    TARGET_STATUS="BLOCKED"
    ;;
  review)
    TARGET_STATUS="READY_FOR_REVIEW"
    ;;
  done)
    TARGET_STATUS="DONE"
    ;;
  backlog)
    if [ -n "$STATUS_OVERRIDE" ]; then
      case "$STATUS_OVERRIDE" in
        NEW|TRIAGED)
          TARGET_STATUS="$STATUS_OVERRIDE"
          ;;
        *)
          echo "Invalid backlog status override: $STATUS_OVERRIDE" >&2
          echo "Allowed backlog statuses: NEW, TRIAGED" >&2
          exit 1
          ;;
      esac
    else
      # Preserve NEW or TRIAGED when moving back to backlog.
      CURRENT_STATUS="$(grep '^- Status:' "$FROM" | sed 's/^- Status: //' || true)"
      case "$CURRENT_STATUS" in
        NEW|TRIAGED)
          TARGET_STATUS="$CURRENT_STATUS"
          ;;
        *)
          TARGET_STATUS="TRIAGED"
          ;;
      esac
    fi
    ;;
esac

mv "$FROM" "$DEST"

if grep -q '^- Status:' "$DEST"; then
  sed -i "s/^- Status: .*/- Status: ${TARGET_STATUS}/" "$DEST"
else
  echo "Warning: no '- Status:' line found in $DEST" >&2
fi

printf 'Moved to %s\n' "$DEST"
printf 'Updated status to %s\n' "$TARGET_STATUS"
