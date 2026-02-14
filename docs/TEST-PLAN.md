# Inkwell Test Plan

## Test Tiers

### Unit Tests (PR Gate)
- Schema validation (§1.1)
- Transaction integrity (§1.2)
- Ghost text decorations (§1.3)
- Y.js conflict resolution (§1.4)
- Model routing (§2.1)
- Queue management (§2.2)
- Context assembly (§2.3)
- Reconciliation (§2.4)
- Local inference (§3.1, §3.2)
- Bridge throughput (§3.3)
- Claude API contract (§4.1)
- MCP indexing (§5.1)
- MCP retrieval (§5.2)
- MCP compliance (§5.3)

### Integration Tests (PR Gate)
- Editor ↔ DocumentAI integration
- DocumentAI ↔ Claude API (VCR fixtures)
- Tauri bridge roundtrip

### Fuzz Tests (Nightly)
- Schema property tests (fast-check)
- Transaction integrity property tests
- Reconciler property tests

### E2E Tests (Nightly)
- Core editing flows (§7.1)
- AI-assisted flows (§7.2)
- Offline/online transitions (§7.3)
- Performance benchmarks (§7.4)

### Eval Tests
- Tier 1: Structural (PR Gate)
- Tier 2: Local Judge (Merge to Main)
- Tier 3: Cloud Judge (Merge to Main + Nightly)

## Coverage Targets

| Package | Statements | Branches |
|---------|-----------|----------|
| editor | 95% | 90% |
| document-ai (reconciler) | 95% | 95% |
| document-ai (queue) | 90% | 85% |
| document-ai (context) | 85% | 80% |
| document-ai (router) | 95% | 90% |
| mcp-workspace | 85% | 80% |
