# Claude Subscription Sign-In Backlog

**Last Updated:** 2026-02-17  
**Owner:** Desktop + Web Platform  
**Goal:** Support Claude account/subscription sign-in in desktop without exposing secrets in renderer.

## Delivery Rules

- No implementation of unsupported/undocumented auth flows.
- All auth secrets must stay out of renderer storage and logs.
- Feature ships behind a flag until end-to-end validation passes.

## Milestones

### M0: Feasibility Gate

| ID | Title | Type | Est. | Depends On | Status |
|---|---|---|---:|---|---|
| CLAUDE-AUTH-001 | Confirm Anthropic-supported third-party subscription sign-in flow (OAuth/OIDC or equivalent) | Discovery | 1d | - | `todo` |

**Acceptance Criteria**
- Written response from Anthropic (support/partner) confirming one of:
- Supported third-party account sign-in flow (with endpoints/scopes/token model), or
- Not supported for external apps.
- Decision recorded in `docs/DECISIONS.md`.

### M1: Auth Foundation (No Vendor Lock-In)

| ID | Title | Type | Est. | Depends On | Status |
|---|---|---|---:|---|---|
| CLAUDE-AUTH-002 | Introduce frontend auth abstraction (`api_key` + future `subscription`) | Web | 0.5d | - | `done` |
| CLAUDE-AUTH-003 | Add AI settings UX state model (`disconnected/connected/unsupported`) | Web | 0.5d | 002 | `done` |
| CLAUDE-AUTH-004 | Add desktop bridge stubs for account auth lifecycle | Desktop | 0.5d | 001 | `done` |

**Acceptance Criteria**
- `document-ai-instance` no longer directly owns auth-source logic.
- UI can represent “subscription sign-in unavailable” without crashing.
- Tests cover auth resolution and unsupported-state rendering.

### M2: Secret Hardening

| ID | Title | Type | Est. | Depends On | Status |
|---|---|---|---:|---|---|
| CLAUDE-AUTH-005 | Move API key persistence from web localStorage to desktop secure storage | Full-stack | 1.5d | 002 | `done` |
| CLAUDE-AUTH-006 | One-time migration + scrub old localStorage secret | Web/Desktop | 0.5d | 005 | `done` |
| CLAUDE-AUTH-007 | Add log redaction and telemetry-safe auth errors | Full-stack | 0.5d | 005 | `done` |

**Acceptance Criteria**
- No API keys/tokens in localStorage.
- No secrets in console, app logs, or error payloads.
- Restart-safe credential retrieval on desktop.

### M3: Subscription Sign-In (Conditional on M0)

| ID | Title | Type | Est. | Depends On | Status |
|---|---|---|---:|---|---|
| CLAUDE-AUTH-008 | Implement OAuth PKCE flow in desktop (browser + callback) | Desktop | 2d | 001,004 | `done_feature_flagged` |
| CLAUDE-AUTH-009 | Token exchange/refresh/revoke + secure token storage | Desktop | 1.5d | 008 | `done_feature_flagged` |
| CLAUDE-AUTH-010 | Web bridge integration for connected account state | Web | 1d | 009 | `done_feature_flagged` |
| CLAUDE-AUTH-011 | AI request path supports account token transport | Full-stack | 1d | 010 | `done_feature_flagged` |

**Acceptance Criteria**
- User can sign in/out through system browser flow.
- Tokens refresh automatically and safely.
- AI operations succeed using account auth where supported.

### M4: Validation + Rollout

| ID | Title | Type | Est. | Depends On | Status |
|---|---|---|---:|---|---|
| CLAUDE-AUTH-012 | Add unit/integration/e2e auth test matrix | Full-stack | 1.5d | 003,005,010 | `todo` |
| CLAUDE-AUTH-013 | Add feature flag + staged rollout controls | Full-stack | 0.5d | 012 | `todo` |
| CLAUDE-AUTH-014 | Release checklist + rollback playbook | Ops | 0.5d | 013 | `todo` |

**Acceptance Criteria**
- Tests pass in CI.
- Flagged rollout can be enabled/disabled without code change.
- Documented rollback path exists.

## Current Execution

### Active Ticket

- `CLAUDE-AUTH-012` — Add unit/integration/e2e auth test matrix.

### Immediate Next Tickets

1. `CLAUDE-AUTH-001`
2. `CLAUDE-AUTH-012`
3. `CLAUDE-AUTH-013`
