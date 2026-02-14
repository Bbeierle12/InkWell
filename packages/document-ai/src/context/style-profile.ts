/**
 * Style Profile
 *
 * Fingerprints the tone, style, and voice of a document
 * for inclusion in the context prefix.
 */

export interface StyleProfile {
  tone: string;
  formality: 'formal' | 'neutral' | 'casual';
  sentenceLength: 'short' | 'medium' | 'long';
  vocabulary: 'simple' | 'moderate' | 'advanced';
}

/** Common contractions that signal casual writing. */
const CONTRACTIONS = [
  "don't", "doesn't", "won't", "can't", "isn't", "aren't", "wasn't",
  "weren't", "hadn't", "hasn't", "haven't", "couldn't", "shouldn't",
  "wouldn't", "it's", "that's", "there's", "here's", "what's",
  "let's", "i'm", "you're", "they're", "we're", "he's", "she's",
  "i've", "you've", "they've", "we've", "i'll", "you'll", "they'll",
  "we'll", "i'd", "you'd", "they'd", "we'd", "gonna", "wanna",
  "gotta", "kinda", "sorta",
];

/** Casual language indicators. */
const CASUAL_INDICATORS = [
  'lol', 'omg', 'btw', 'imo', 'imho', 'tbh', 'ngl',
  'yeah', 'yep', 'nope', 'hey', 'hi', 'cool', 'awesome',
  'stuff', 'thing', 'ok', 'okay',
];

/** Formal language indicators. */
const FORMAL_INDICATORS = [
  'furthermore', 'moreover', 'consequently', 'nevertheless',
  'henceforth', 'notwithstanding', 'pursuant', 'hereby',
  'whereas', 'thereof', 'herein', 'accordingly',
  'shall', 'endeavor', 'ascertain', 'facilitate',
  'subsequent', 'prior', 'aforementioned', 'respectively',
];

/**
 * Analyze a document and produce a style profile.
 */
export function analyzeStyle(content: string): StyleProfile {
  if (!content || content.trim().length === 0) {
    return {
      tone: 'neutral',
      formality: 'neutral',
      sentenceLength: 'medium',
      vocabulary: 'moderate',
    };
  }

  const lowerContent = content.toLowerCase();
  const words = content.split(/\s+/).filter((w) => w.length > 0);

  const formality = analyzeFormality(lowerContent, words);
  const sentenceLength = analyzeSentenceLength(content);
  const vocabulary = analyzeVocabulary(words);
  const tone = deriveTone(formality, sentenceLength, vocabulary);

  return { tone, formality, sentenceLength, vocabulary };
}

/**
 * Determine formality level based on contractions, casual words, and formal words.
 */
function analyzeFormality(
  lowerContent: string,
  words: string[],
): 'formal' | 'neutral' | 'casual' {
  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z']/g, ''));

  let casualScore = 0;
  let formalScore = 0;

  // Check for contractions
  for (const contraction of CONTRACTIONS) {
    if (lowerContent.includes(contraction)) {
      casualScore++;
    }
  }

  // Check for casual indicators
  for (const indicator of CASUAL_INDICATORS) {
    if (lowerWords.includes(indicator)) {
      casualScore += 2;
    }
  }

  // Check for formal indicators
  for (const indicator of FORMAL_INDICATORS) {
    if (lowerWords.includes(indicator)) {
      formalScore += 2;
    }
  }

  if (formalScore > casualScore && formalScore >= 2) {
    return 'formal';
  }
  if (casualScore > formalScore && casualScore >= 2) {
    return 'casual';
  }
  return 'neutral';
}

/**
 * Analyze average sentence length.
 */
function analyzeSentenceLength(content: string): 'short' | 'medium' | 'long' {
  // Split on sentence-ending punctuation
  const sentences = content
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return 'medium';
  }

  const totalWords = sentences.reduce((sum, sentence) => {
    const words = sentence.split(/\s+/).filter((w) => w.length > 0);
    return sum + words.length;
  }, 0);

  const avgWords = totalWords / sentences.length;

  if (avgWords < 10) {
    return 'short';
  }
  if (avgWords > 20) {
    return 'long';
  }
  return 'medium';
}

/**
 * Analyze vocabulary complexity based on average word length.
 */
function analyzeVocabulary(
  words: string[],
): 'simple' | 'moderate' | 'advanced' {
  if (words.length === 0) {
    return 'moderate';
  }

  // Strip punctuation for accurate word length measurement
  const cleanWords = words
    .map((w) => w.replace(/[^a-zA-Z]/g, ''))
    .filter((w) => w.length > 0);

  if (cleanWords.length === 0) {
    return 'moderate';
  }

  const totalLength = cleanWords.reduce((sum, w) => sum + w.length, 0);
  const avgLength = totalLength / cleanWords.length;

  if (avgLength < 5) {
    return 'simple';
  }
  if (avgLength > 7) {
    return 'advanced';
  }
  return 'moderate';
}

/**
 * Derive a descriptive tone string from the component analyses.
 */
function deriveTone(
  formality: 'formal' | 'neutral' | 'casual',
  sentenceLength: 'short' | 'medium' | 'long',
  vocabulary: 'simple' | 'moderate' | 'advanced',
): string {
  if (formality === 'formal' && vocabulary === 'advanced') {
    return 'academic';
  }
  if (formality === 'formal') {
    return 'professional';
  }
  if (formality === 'casual' && sentenceLength === 'short') {
    return 'conversational';
  }
  if (formality === 'casual') {
    return 'conversational';
  }
  if (vocabulary === 'advanced' && sentenceLength === 'long') {
    return 'academic';
  }
  if (vocabulary === 'simple' && sentenceLength === 'short') {
    return 'conversational';
  }
  return 'professional';
}
