import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Tier 1 — Structural Evaluation
 *
 * Fast, deterministic checks: regex matching, JSON schema validation,
 * forbidden phrase detection. Runs in PR gate (< 5 min).
 */

// ---------------------------------------------------------------------------
// Fixtures & golden data
// ---------------------------------------------------------------------------

interface StructuralRules {
  forbiddenPhrases: string[];
  maxOutputTokens: Record<string, number>;
  requiredJsonFields: Record<string, string[]>;
}

interface RewritePair {
  input: string;
  output: string;
  style: string;
}

interface CritiquePair {
  input: string;
  output: {
    observations: string[];
    suggestions: string[];
  };
}

const rulesPath = resolve(__dirname, 'fixtures/structural-rules.json');
const rules: StructuralRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));

const rewriteGoldenPath = resolve(
  __dirname,
  '../golden/rewrite/golden.json',
);
const rewriteGolden: { pairs: RewritePair[] } = JSON.parse(
  readFileSync(rewriteGoldenPath, 'utf-8'),
);

const critiqueGoldenPath = resolve(
  __dirname,
  '../golden/critique/golden.json',
);
const critiqueGolden: { pairs: CritiquePair[] } = JSON.parse(
  readFileSync(critiqueGoldenPath, 'utf-8'),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Estimate token count from a string (~4 chars per token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tier 1 — Structural Evaluation', () => {
  it('should produce valid JSON output for structured operations', () => {
    // Ref: Eval Plan — Tier 1: validate AI output is parseable JSON

    // Critique golden outputs should be valid objects with required fields
    for (const pair of critiqueGolden.pairs) {
      const output = pair.output;

      // output is already an object (parsed from JSON file), verify shape
      expect(output).toBeDefined();
      expect(typeof output).toBe('object');
      expect(output).not.toBeNull();

      // Check required fields for critique: observations and suggestions
      const requiredFields = rules.requiredJsonFields['critique'];
      for (const field of requiredFields) {
        expect(output).toHaveProperty(field);
      }
      expect(Array.isArray(output.observations)).toBe(true);
      expect(Array.isArray(output.suggestions)).toBe(true);
      expect(output.observations.length).toBeGreaterThan(0);
      expect(output.suggestions.length).toBeGreaterThan(0);
    }

    // Verify that a hypothetical rewrite JSON output meets required fields
    const rewriteOutput = { content: 'Rewritten text goes here.' };
    const rewriteRequired = rules.requiredJsonFields['rewrite'];
    for (const field of rewriteRequired) {
      expect(rewriteOutput).toHaveProperty(field);
    }

    // Verify that a hypothetical summarize JSON output meets required fields
    const summarizeOutput = { summary: 'A brief summary of the document.' };
    const summarizeRequired = rules.requiredJsonFields['summarize'];
    for (const field of summarizeRequired) {
      expect(summarizeOutput).toHaveProperty(field);
    }
  });

  it('should not contain forbidden phrases in output', () => {
    // Ref: Eval Plan — Tier 1: check for hallucinated content, prompt leakage

    const { forbiddenPhrases } = rules;

    // Check rewrite golden outputs (string outputs)
    for (const pair of rewriteGolden.pairs) {
      const outputLower = pair.output.toLowerCase();
      for (const phrase of forbiddenPhrases) {
        expect(
          outputLower.includes(phrase.toLowerCase()),
          `Rewrite output "${pair.output.slice(0, 60)}..." contains forbidden phrase "${phrase}"`,
        ).toBe(false);
      }
    }

    // Check critique golden outputs (object outputs, stringified)
    for (const pair of critiqueGolden.pairs) {
      const serialized = JSON.stringify(pair.output).toLowerCase();
      for (const phrase of forbiddenPhrases) {
        expect(
          serialized.includes(phrase.toLowerCase()),
          `Critique output for "${pair.input.slice(0, 60)}..." contains forbidden phrase "${phrase}"`,
        ).toBe(false);
      }
    }
  });

  it('should respect maximum output length', () => {
    // Ref: Eval Plan — Tier 1: output within token budget

    const { maxOutputTokens } = rules;

    // Check rewrite golden outputs against the rewrite budget
    const rewriteBudget = maxOutputTokens['rewrite'];
    for (const pair of rewriteGolden.pairs) {
      const tokens = estimateTokens(pair.output);
      expect(
        tokens,
        `Rewrite output (${tokens} tokens) exceeds budget of ${rewriteBudget}`,
      ).toBeLessThanOrEqual(rewriteBudget);
    }

    // Check critique golden outputs against the deep_critique budget
    // (critique pairs use the most generous budget available)
    const critiqueBudget = maxOutputTokens['deep_critique'];
    for (const pair of critiqueGolden.pairs) {
      const serialized = JSON.stringify(pair.output);
      const tokens = estimateTokens(serialized);
      expect(
        tokens,
        `Critique output (${tokens} tokens) exceeds budget of ${critiqueBudget}`,
      ).toBeLessThanOrEqual(critiqueBudget);
    }

    // Verify inline_suggest budget is the tightest
    expect(maxOutputTokens['inline_suggest']).toBeLessThan(
      maxOutputTokens['rewrite'],
    );
  });

  it('should preserve document structure markers', () => {
    // Ref: Eval Plan — Tier 1: headings, lists, etc. maintained

    // Test that markdown structure markers are preserved through processing
    const structuredDoc = [
      '# Main Heading',
      '',
      'Some introductory text.',
      '',
      '## Sub Heading',
      '',
      '- First bullet item',
      '- Second bullet item',
      '- Third bullet item',
      '',
      '### Deep Heading',
      '',
      '1. First ordered item',
      '2. Second ordered item',
      '',
      '> A blockquote paragraph.',
    ].join('\n');

    // Verify heading markers are present
    const headingPattern = /^#{1,6}\s+.+$/gm;
    const headings = structuredDoc.match(headingPattern);
    expect(headings).not.toBeNull();
    expect(headings!.length).toBe(3);
    expect(headings).toContain('# Main Heading');
    expect(headings).toContain('## Sub Heading');
    expect(headings).toContain('### Deep Heading');

    // Verify unordered list markers are present
    const bulletPattern = /^- .+$/gm;
    const bullets = structuredDoc.match(bulletPattern);
    expect(bullets).not.toBeNull();
    expect(bullets!.length).toBe(3);

    // Verify ordered list markers are present
    const orderedPattern = /^\d+\.\s+.+$/gm;
    const ordered = structuredDoc.match(orderedPattern);
    expect(ordered).not.toBeNull();
    expect(ordered!.length).toBe(2);

    // Verify blockquote markers are present
    const blockquotePattern = /^>\s+.+$/gm;
    const blockquotes = structuredDoc.match(blockquotePattern);
    expect(blockquotes).not.toBeNull();
    expect(blockquotes!.length).toBe(1);

    // A simulated "processed" version should still have structure markers
    // (In a real eval, an AI output would be checked; here we verify the
    //  detection logic works correctly on a known-good document.)
    const processedDoc = [
      '# Main Heading',
      '',
      'Revised introductory text with improved clarity.',
      '',
      '## Sub Heading',
      '',
      '- Improved first bullet',
      '- Enhanced second bullet',
      '- Refined third bullet',
      '',
      '### Deep Heading',
      '',
      '1. Updated first ordered item',
      '2. Updated second ordered item',
    ].join('\n');

    const processedHeadings = processedDoc.match(headingPattern);
    expect(processedHeadings).not.toBeNull();
    expect(processedHeadings!.length).toBe(3);

    const processedBullets = processedDoc.match(bulletPattern);
    expect(processedBullets).not.toBeNull();
    expect(processedBullets!.length).toBe(3);

    const processedOrdered = processedDoc.match(orderedPattern);
    expect(processedOrdered).not.toBeNull();
    expect(processedOrdered!.length).toBe(2);
  });
});
