# Inkwell Prompt Engineering

## Prompt Structure

All prompts to Claude follow this structure:

```
[System: stable prefix — cached]
  - Role definition
  - Style profile of current document
  - Document outline

[User: volatile suffix — not cached]
  - Current paragraph context
  - Cursor position breadcrumbs
  - Operation-specific instructions
```

## Operation Prompts

### Inline Suggest
- Model: Local (llama.cpp)
- Budget: 4,000 tokens
- Goal: Continue the current sentence naturally

### Rewrite
- Model: Claude Sonnet
- Budget: 16,000 tokens
- Goal: Rewrite selected text preserving meaning, adjusting style

### Summarize
- Model: Claude Sonnet
- Budget: 16,000 tokens
- Goal: Condense selected text to key points

### Expand
- Model: Claude Sonnet
- Budget: 16,000 tokens
- Goal: Elaborate on selected text with supporting detail

### Critique
- Model: Claude Opus
- Budget: 32,000 tokens
- Goal: Deep analysis with observations and actionable suggestions

### Voice Refine
- Model: Claude Sonnet
- Budget: 16,000 tokens
- Goal: Clean up voice transcription while preserving intent

## Prompt Caching Strategy

The stable prefix (system prompt + style profile + outline) is designed to be
identical across consecutive requests, enabling Claude's prompt caching to
reduce latency and cost. Only the volatile suffix changes per request.

## Privacy

Documents marked as private MUST use local inference only. The privacy canary
string `CANARY_PRIVATE_DO_NOT_TRANSMIT` is embedded in private documents and
caught by the MSW interceptor in tests and by the router in production.
