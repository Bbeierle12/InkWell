/**
 * Tier 3 — Cloud Judge (Claude-as-Judge)
 *
 * Uses Claude as an automated judge for highest-quality evaluation.
 * Runs on merge to main and nightly.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface CloudJudgeResult {
  score: number;
  reasoning: string;
  criteria: Record<string, number>;
  model: string;
}

interface JudgePrompts {
  systemPrompt: string;
  criteria: Record<string, string[]>;
}

const promptsPath = resolve(__dirname, 'fixtures/judge-prompts.json');
const judgePrompts: JudgePrompts = JSON.parse(readFileSync(promptsPath, 'utf-8'));

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Extract JSON from a string that may be wrapped in markdown code fences.
 */
function extractJson(text: string): string {
  // Try to extract from ```json ... ``` or ``` ... ``` blocks
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Otherwise try the whole string
  return text.trim();
}

/**
 * Run the cloud judge (Claude) on an AI output against golden reference.
 *
 * @param input - Original input text
 * @param output - AI-generated output
 * @param golden - Golden reference output
 * @param operation - Operation type to look up criteria
 */
export async function cloudJudge(
  input: string,
  output: string,
  golden: string,
  operation: string,
): Promise<CloudJudgeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is not set. ' +
      'Cloud judge requires a valid Anthropic API key. ' +
      'Set it with: export ANTHROPIC_API_KEY=sk-ant-...',
    );
  }

  const criteriaNames = judgePrompts.criteria[operation];
  if (!criteriaNames) {
    throw new Error(`Unknown operation: ${operation}. Available: ${Object.keys(judgePrompts.criteria).join(', ')}`);
  }

  const goldenStr = typeof golden === 'object' ? JSON.stringify(golden) : golden;

  const userPrompt =
    `Evaluate this AI output for a "${operation}" operation.\n\n` +
    `## Original Input\n${input}\n\n` +
    `## AI Output\n${output}\n\n` +
    `## Golden Reference\n${goldenStr}\n\n` +
    `## Criteria to Evaluate\n${criteriaNames.join(', ')}\n\n` +
    `Return a JSON object with:\n` +
    `- "score": overall score 0-10\n` +
    `- "reasoning": brief explanation\n` +
    `- "criteria": object mapping each criterion name to its score 0-10`;

  const requestBody = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: judgePrompts.systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
    ],
  };

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Claude API error (${response.status}): ${errorBody}`,
    );
  }

  const responseData = await response.json();

  // Extract the text content from Claude's response
  const textContent = responseData.content?.find(
    (block: { type: string }) => block.type === 'text',
  );

  if (!textContent?.text) {
    throw new Error('No text content in Claude response');
  }

  // Parse the JSON result
  const jsonStr = extractJson(textContent.text);
  let parsed: { score: number; reasoning: string; criteria: Record<string, number> };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse judge response as JSON: ${jsonStr.slice(0, 200)}`,
    );
  }

  return {
    score: parsed.score,
    reasoning: parsed.reasoning,
    criteria: parsed.criteria,
    model: CLAUDE_MODEL,
  };
}
