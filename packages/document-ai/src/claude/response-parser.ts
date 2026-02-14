/**
 * Response Parser
 *
 * Parses Claude API streaming output into AIEditInstruction arrays.
 * Handles JSON extraction from raw text, including markdown code fences.
 */
import type { AIEditInstruction } from '@inkwell/shared';
import { validateInstructions } from '../reconciler/schema-validator';

/**
 * Extract JSON content from text that may be wrapped in markdown code fences.
 */
function extractJSON(text: string): string {
  const trimmed = text.trim();

  // Try to extract from ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return trimmed;
}

/**
 * Parse raw AI response text into an array of AIEditInstructions.
 *
 * Returns [] on any parse or validation error (fail-safe).
 */
export function parseAIResponse(text: string): AIEditInstruction[] {
  try {
    const jsonStr = extractJSON(text);
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const error = validateInstructions(parsed as AIEditInstruction[], null);
    if (error !== null) {
      return [];
    }

    return parsed as AIEditInstruction[];
  } catch {
    return [];
  }
}

/**
 * Collect all text deltas from a stream and parse the result.
 *
 * @returns Object with the raw accumulated text and parsed instructions.
 */
export async function collectAndParse(
  stream: AsyncGenerator<string, void, unknown>,
): Promise<{ raw: string; instructions: AIEditInstruction[] }> {
  let raw = '';
  for await (const delta of stream) {
    raw += delta;
  }
  const instructions = parseAIResponse(raw);
  return { raw, instructions };
}
