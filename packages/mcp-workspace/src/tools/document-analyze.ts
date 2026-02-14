/**
 * Document Analyze Tool
 *
 * MCP tool that provides structural analysis of a document.
 */

import type { AnalysisResult } from '@inkwell/shared';

/**
 * Analyze the structure and content of a document.
 *
 * Returns word/sentence/paragraph counts, detected headings,
 * a heuristic reading level, and estimated reading time.
 */
export async function documentAnalyze(
  content: string,
): Promise<AnalysisResult> {
  const trimmed = content.trim();

  if (!trimmed) {
    return {
      wordCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      headings: [],
      readingLevel: 'N/A',
      estimatedReadTimeMinutes: 0,
    };
  }

  const words = trimmed.split(/\s+/);
  const wordCount = words.length;

  // Sentences: split on .!? followed by space or end
  const sentences = trimmed
    .split(/[.!?]+(?:\s|$)/)
    .filter((s) => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);

  // Paragraphs: split on double newline
  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length || 1;

  // Headings: lines starting with # (markdown)
  const headings = trimmed
    .split('\n')
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#+\s+/, '').trim());

  // Reading level: simple heuristic based on avg words per sentence
  const avgWordsPerSentence = wordCount / sentenceCount;
  let readingLevel = 'elementary';
  if (avgWordsPerSentence > 20) readingLevel = 'advanced';
  else if (avgWordsPerSentence > 14) readingLevel = 'intermediate';

  // Reading time: ~200 wpm
  const estimatedReadTimeMinutes = Math.max(
    Math.round((wordCount / 200) * 10) / 10,
    0.1,
  );

  return {
    wordCount,
    sentenceCount,
    paragraphCount,
    headings,
    readingLevel,
    estimatedReadTimeMinutes,
  };
}
