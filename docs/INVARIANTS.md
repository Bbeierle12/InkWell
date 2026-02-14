# Inkwell System Invariants

The following 14 invariants are tracked and tested across the codebase.

| # | ID | Description | Test Location |
|---|-----|-------------|---------------|
| 1 | schema-valid-after-operation | Every editor operation produces a schema-valid document | editor/schema, transactions |
| 2 | serialize-deserialize-stable | JSON roundtrip produces identical document | editor/schema |
| 3 | decorations-never-serialized | Ghost text decorations never appear in serialized output | editor/ghost-text |
| 4 | undo-redo-exact-state | Undo restores exact previous document state | editor/ai-undo, transactions |
| 5 | ai-ops-single-undo-step | Multi-step AI edits collapse to one undo step | editor/ai-undo |
| 6 | no-orphaned-streams-after-close | All streams abort when document closes | document-ai/queue, claude |
| 7 | no-late-mutations-after-teardown | No mutations after service teardown | document-ai lifecycle |
| 8 | private-docs-never-reach-cloud | Private documents never sent to cloud API | document-ai/router, canary |
| 9 | token-counts-match-claude-tokenizer | Token counts match Claude's tokenizer | document-ai/context |
| 10 | reconciler-valid-or-reject | Reconciler produces valid output or rejects entirely | document-ai/reconciler |
| 11 | queue-respects-token-budget | Queue never exceeds per-minute token budget | document-ai/queue |
| 12 | stream-errors-no-partial-edits | Stream errors leave no partial edits in document | document-ai/reconciler |
| 13 | ghost-text-no-flicker | Ghost text updates only when sufficiently different | editor/ghost-text |
| 14 | remote-changes-no-suggestion-trigger | Remote Y.js changes don't trigger AI suggestions | editor/collaboration |
