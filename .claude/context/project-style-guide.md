---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T00:11:35Z
version: 1.0
author: Claude Code PM System
---

# Style Guide: Inkwell

## TypeScript Conventions

### General
- Strict mode enabled (`"strict": true` in all tsconfigs)
- Target ES2022 with ESNext modules
- Module resolution: `bundler`
- No `any` types — use `unknown` and narrow

### Naming
- **Files**: `kebab-case.ts` (e.g., `ghost-text/index.ts`, `stream-handler.ts`)
- **React components**: `PascalCase.tsx` (e.g., `Editor.tsx`, `Toolbar.tsx`)
- **Interfaces/Types**: `PascalCase` (e.g., `AIEditInstruction`, `DocumentContext`)
- **Enums**: `PascalCase` with `PascalCase` members (e.g., `OperationType.InlineSuggest`)
- **Constants**: `SCREAMING_SNAKE_CASE` (e.g., `PRIVACY_CANARY`, `TOKEN_BUDGETS`)
- **Functions/Variables**: `camelCase` (e.g., `levenshteinRatio`, `contentHash`)

### Exports
- Barrel exports via `src/index.ts` in each package
- Named exports preferred over default exports
- Re-export from sub-modules: `export { X } from './module';`

### Imports
- Workspace packages imported as `@inkwell/package-name`
- Relative imports within packages: `./relative/path`
- Type-only imports where applicable: `import type { X } from '...'`

## React Conventions

### Components
- Functional components with `'use client'` directive where needed
- Props interfaces defined inline or in the same file
- Hooks in `src/hooks/` directory with `use` prefix

### State Management
- Zustand for global client state
- React state for component-local state
- No Redux

## Rust Conventions

### General
- Module structure follows Rust conventions (`mod.rs` for directories)
- Public API documented with `///` doc comments
- Error types use custom enums with `Display` + `Error` trait impls

### Naming
- Files: `snake_case.rs`
- Structs/Enums: `PascalCase`
- Functions/Variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`

### Tauri
- Commands annotated with `#[tauri::command]`
- Request/response types derive `Serialize`/`Deserialize`
- Async commands return `Result<T, String>`

## Testing Conventions

### Structure
- Tests co-located in `__tests__/` directories next to source
- Unit tests: `name.test.ts`
- Property-based tests: `name.property.test.ts`
- E2E tests: `name.spec.ts`

### Patterns
- Vitest for all JS/TS tests
- fast-check for property-based testing
- MSW for API mocking with VCR fixtures
- jsdom environment for editor tests
- Playwright for E2E

### Test References
- Test descriptions reference the test plan sections: `// Ref: Test Plan §X.Y`
- Invariant tests reference invariant IDs: `// Invariant: invariant-id`

## Code Organization

### Package Dependencies
```
@inkwell/shared          → (no internal deps)
@inkwell/editor          → @inkwell/shared
@inkwell/document-ai     → @inkwell/shared
@inkwell/mcp-workspace   → @inkwell/shared
@inkwell/web             → @inkwell/editor, @inkwell/document-ai, @inkwell/shared
@inkwell/evals           → @inkwell/document-ai, @inkwell/shared
```

### Configuration
- Each package has its own `tsconfig.json` and `vitest.config.ts`
- Turborepo manages cross-package build ordering
- No TypeScript project references (removed for `tsc --noEmit` compatibility)

## Formatting

- Prettier for code formatting
- No explicit Prettier config (uses defaults)
- Run: `pnpm format` to format all files
