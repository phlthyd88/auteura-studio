# Codex Ticket Workflow

## State Definitions

### NEW
Ticket exists but has not been analyzed.

### TRIAGED
Ticket has:
- clear problem statement
- clear scope
- acceptance criteria
- root-cause hypothesis
- validation plan

### IN_PROGRESS
Ticket has:
- implementation plan
- active progress log
- active code changes

### BLOCKED
Ticket cannot proceed because of a concrete blocker.
Required:
- exact blocker
- exact failed command/error
- attempted remediation
- remaining unverified items

### READY_FOR_REVIEW
Ticket has:
- completed implementation
- validation results
- final summary
- residual risks documented

### DONE
Ticket has:
- acceptance criteria satisfied
- validation completed or transparently bounded
- no misleading status left behind

## Required Transitions

NEW -> TRIAGED
Only after root-cause and validation plan are documented.

TRIAGED -> IN_PROGRESS
Only after implementation plan is documented.

IN_PROGRESS -> BLOCKED
Only with exact blocker recorded.

IN_PROGRESS -> READY_FOR_REVIEW
Only after implementation and validation attempt.

READY_FOR_REVIEW -> DONE
Only after acceptance criteria are met and ticket summary is complete.
