/**
 * Document Style Guide Tool
 *
 * MCP tool that extracts or enforces a style guide for a document.
 */

import type { StyleGuideResult } from '@inkwell/shared';

/**
 * Extract or apply a style guide for the given document.
 *
 * Performs heuristic analysis of tone, formality, sentence length,
 * vocabulary complexity, and provides actionable recommendations.
 */
export async function documentStyleGuide(
  content: string,
): Promise<StyleGuideResult> {
  const trimmed = content.trim();

  if (!trimmed) {
    return {
      tone: 'neutral',
      formality: 'neutral',
      sentenceLength: 'N/A',
      vocabulary: 'simple',
      recommendations: [],
    };
  }

  const words = trimmed.split(/\s+/);
  const sentences = trimmed
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0);
  const avgWordsPerSentence =
    sentences.length > 0 ? words.length / sentences.length : 0;

  // Tone detection
  const exclamations = (trimmed.match(/!/g) || []).length;
  const questions = (trimmed.match(/\?/g) || []).length;
  let tone = 'neutral';
  if (exclamations > sentences.length * 0.3) tone = 'enthusiastic';
  else if (questions > sentences.length * 0.3) tone = 'inquisitive';

  // Formality detection
  const informalWords = [
    'gonna',
    'wanna',
    'gotta',
    "can't",
    "won't",
    "don't",
    'yeah',
    'hey',
    'ok',
    'stuff',
    'things',
  ];
  const formalWords = [
    'therefore',
    'furthermore',
    'consequently',
    'nevertheless',
    'notwithstanding',
    'accordingly',
    'henceforth',
  ];
  const lowerText = trimmed.toLowerCase();
  const informalCount = informalWords.filter((w) =>
    lowerText.includes(w),
  ).length;
  const formalCount = formalWords.filter((w) => lowerText.includes(w)).length;
  let formality = 'neutral';
  if (formalCount > informalCount) formality = 'formal';
  else if (informalCount > formalCount) formality = 'informal';

  // Sentence length
  let sentenceLength = 'medium';
  if (avgWordsPerSentence > 20) sentenceLength = 'long';
  else if (avgWordsPerSentence < 10) sentenceLength = 'short';

  // Vocabulary
  const avgWordLength =
    words.reduce((sum, w) => sum + w.length, 0) / words.length;
  let vocabulary = 'simple';
  if (avgWordLength > 7) vocabulary = 'complex';
  else if (avgWordLength > 5) vocabulary = 'moderate';

  // Recommendations
  const recommendations: string[] = [];
  if (avgWordsPerSentence > 25)
    recommendations.push('Consider shorter sentences for readability');
  if (avgWordsPerSentence < 8)
    recommendations.push('Consider varying sentence length');
  if (vocabulary === 'complex')
    recommendations.push('Consider simpler word choices where possible');
  if (formality === 'informal')
    recommendations.push(
      'Consider more formal language for professional documents',
    );

  return { tone, formality, sentenceLength, vocabulary, recommendations };
}
