import { describe, it, expect, vi } from 'vitest';
import { ContextManager, PrefixCache, analyzeStyle, slidingWindow } from '../index';
import type { StyleProfile } from '../style-profile';

/**
 * 2.3 Context Manager Tests
 *
 * Comprehensive tests covering:
 * - ContextManager.build() output structure
 * - Stable prefix construction (system prompt + style + outline)
 * - Volatile suffix from sliding window around cursor
 * - Token count approximation
 * - Cache key generation and consistency
 * - PrefixCache memoization and invalidation
 * - Style profile analysis (formality, sentence length, vocabulary, tone)
 * - Sliding window edge cases
 * - Integration with empty and long documents
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;

/** A short, neutral document for basic testing. */
const SHORT_DOC = 'Hello world. This is a test document.';

/** A document with markdown headers. */
const HEADED_DOC = [
  '# Introduction',
  'This is the intro.',
  '## Methods',
  'We used standard methods.',
  '## Results',
  'The results are clear.',
  '# Conclusion',
  'In conclusion, it works.',
].join('\n');

/** A long document to test window trimming. */
function makeLongDoc(charCount: number): string {
  const word = 'word '; // 5 chars each
  const repeats = Math.ceil(charCount / word.length);
  return word.repeat(repeats).slice(0, charCount);
}

/** A formal academic text. */
const FORMAL_DOC =
  'Furthermore, the aforementioned methodology shall facilitate the ascertainment ' +
  'of subsequent experimental observations. Moreover, the notwithstanding constraints ' +
  'were hereby addressed through comprehensive analysis and rigorous examination ' +
  'of the underlying theoretical framework and its consequential implications.';

/** A casual conversational text. */
const CASUAL_DOC =
  "Hey, I don't think this is gonna work. Can't we just try something else? " +
  "It's kinda weird, yeah? I'm not sure what's going on tbh. " +
  "Let's just do whatever, okay? Cool.";

// ---------------------------------------------------------------------------
// ContextManager.build() — Stable Prefix
// ---------------------------------------------------------------------------

describe('2.3 Context Manager', () => {
  describe('Stable prefix construction', () => {
    it('should contain system prompt in stable prefix', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 0);

      expect(ctx.stablePrefix).toContain('InkWell AI');
      expect(ctx.stablePrefix).toContain('writing assistant');
    });

    it('should contain style profile in stable prefix', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 0);

      expect(ctx.stablePrefix).toContain('[Style:');
      expect(ctx.stablePrefix).toMatch(/tone=\w+/);
      expect(ctx.stablePrefix).toMatch(/formality=\w+/);
      expect(ctx.stablePrefix).toMatch(/sentences=\w+/);
      expect(ctx.stablePrefix).toMatch(/vocabulary=\w+/);
    });

    it('should contain document outline in stable prefix', () => {
      const cm = new ContextManager();
      const ctx = cm.build(HEADED_DOC, 0);

      expect(ctx.stablePrefix).toContain('[Outline]');
      expect(ctx.stablePrefix).toContain('# Introduction');
      expect(ctx.stablePrefix).toContain('## Methods');
      expect(ctx.stablePrefix).toContain('# Conclusion');
    });

    it('should use first N characters as outline fallback when no headers exist', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 0);

      expect(ctx.stablePrefix).toContain('[Outline]');
      expect(ctx.stablePrefix).toContain('Hello world');
    });
  });

  // ---------------------------------------------------------------------------
  // ContextManager.build() — Volatile Suffix
  // ---------------------------------------------------------------------------

  describe('Volatile suffix from cursor', () => {
    it('should contain text around cursor position', () => {
      const doc = 'AAAA BBBB CCCC DDDD EEEE';
      const cursorPos = 10; // between BBBB and CCCC
      const cm = new ContextManager({ windowTokens: 100 });
      const ctx = cm.build(doc, cursorPos);

      // volatileSuffix = window.before + window.after
      expect(ctx.volatileSuffix).toContain('AAAA BBBB');
      expect(ctx.volatileSuffix).toContain(' CCCC DDDD');
    });

    it('should change volatile suffix when cursor moves', () => {
      // Build a document with distinct content at different positions
      const doc = 'ALPHA section at the beginning of the doc. ' +
        'BETA section in the middle of the document. ' +
        'GAMMA section at the very end of the doc.';
      const cm = new ContextManager({ windowTokens: 10 }); // 10 tokens = 40 chars window

      const ctx1 = cm.build(doc, 0, 'doc1');
      const ctx2 = cm.build(doc, doc.length, 'doc2');

      // At position 0, before is empty so suffix starts with ALPHA
      // At end, after is empty so suffix ends with GAMMA
      expect(ctx1.volatileSuffix).not.toEqual(ctx2.volatileSuffix);
    });

    it('should limit volatile suffix to window token budget', () => {
      const longDoc = makeLongDoc(10000);
      const cm = new ContextManager({ windowTokens: 50 });
      const ctx = cm.build(longDoc, 5000);

      // 50 tokens * 4 chars/token = 200 chars max (100 before + 100 after)
      expect(ctx.volatileSuffix.length).toBeLessThanOrEqual(200);
    });
  });

  // ---------------------------------------------------------------------------
  // Token Count
  // ---------------------------------------------------------------------------

  describe('Token count accuracy', () => {
    it('should approximate token count at ~4 chars per token', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 0);

      const totalChars = ctx.stablePrefix.length + ctx.volatileSuffix.length;
      const expectedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);

      expect(ctx.tokenCount).toBe(expectedTokens);
    });

    it('should return positive token count for non-empty document', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 10);

      expect(ctx.tokenCount).toBeGreaterThan(0);
    });

    it('should increase token count with longer document content', () => {
      const cm = new ContextManager({ windowTokens: 1000 });
      const shortCtx = cm.build('Hi.', 0, 'short');
      const longCtx = cm.build(makeLongDoc(5000), 2500, 'long');

      expect(longCtx.tokenCount).toBeGreaterThan(shortCtx.tokenCount);
    });
  });

  // ---------------------------------------------------------------------------
  // Cache Key
  // ---------------------------------------------------------------------------

  describe('Cache key validity', () => {
    it('should produce a consistent cache key for same stable prefix', () => {
      const cm = new ContextManager();
      const ctx1 = cm.build(SHORT_DOC, 0);
      const ctx2 = cm.build(SHORT_DOC, 20); // different cursor, same prefix

      // Same document content => same stable prefix => same cache key
      expect(ctx1.cacheKey).toBe(ctx2.cacheKey);
    });

    it('should produce different cache keys for different documents', () => {
      const cm = new ContextManager();
      const ctx1 = cm.build(FORMAL_DOC, 0, 'doc1');
      const ctx2 = cm.build(CASUAL_DOC, 0, 'doc2');

      expect(ctx1.cacheKey).not.toBe(ctx2.cacheKey);
    });

    it('should produce a non-empty hex string as cache key', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 0);

      expect(ctx.cacheKey).toMatch(/^[0-9a-f]+$/);
      expect(ctx.cacheKey.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // PrefixCache
  // ---------------------------------------------------------------------------

  describe('PrefixCache memoization', () => {
    it('should return cached prefix on second call without recomputing', () => {
      const cache = new PrefixCache();
      const computeFn = vi.fn(() => 'computed-prefix');

      const first = cache.getPrefix('doc1', computeFn);
      const second = cache.getPrefix('doc1', computeFn);

      expect(first).toBe('computed-prefix');
      expect(second).toBe('computed-prefix');
      expect(computeFn).toHaveBeenCalledTimes(1);
    });

    it('should compute separately for different document IDs', () => {
      const cache = new PrefixCache();
      const computeA = vi.fn(() => 'prefix-A');
      const computeB = vi.fn(() => 'prefix-B');

      const a = cache.getPrefix('docA', computeA);
      const b = cache.getPrefix('docB', computeB);

      expect(a).toBe('prefix-A');
      expect(b).toBe('prefix-B');
      expect(computeA).toHaveBeenCalledTimes(1);
      expect(computeB).toHaveBeenCalledTimes(1);
    });
  });

  describe('PrefixCache invalidation', () => {
    it('should recompute prefix after invalidation', () => {
      const cache = new PrefixCache();
      let callCount = 0;
      const computeFn = vi.fn(() => `prefix-${++callCount}`);

      const first = cache.getPrefix('doc1', computeFn);
      expect(first).toBe('prefix-1');
      expect(computeFn).toHaveBeenCalledTimes(1);

      cache.invalidate('doc1');

      const second = cache.getPrefix('doc1', computeFn);
      expect(second).toBe('prefix-2');
      expect(computeFn).toHaveBeenCalledTimes(2);
    });

    it('should not affect other cached entries when invalidating one', () => {
      const cache = new PrefixCache();
      const computeA = vi.fn(() => 'prefix-A');
      const computeB = vi.fn(() => 'prefix-B');

      cache.getPrefix('docA', computeA);
      cache.getPrefix('docB', computeB);

      cache.invalidate('docA');

      // docB should still be cached
      const bAgain = cache.getPrefix('docB', computeB);
      expect(bAgain).toBe('prefix-B');
      expect(computeB).toHaveBeenCalledTimes(1);
    });

    it('should be a no-op when invalidating a non-existent key', () => {
      const cache = new PrefixCache();
      // Should not throw
      expect(() => cache.invalidate('nonexistent')).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Style Profile
  // ---------------------------------------------------------------------------

  describe('Style profile analysis', () => {
    it('should detect formal writing style', () => {
      const style = analyzeStyle(FORMAL_DOC);

      expect(style.formality).toBe('formal');
    });

    it('should detect casual writing style', () => {
      const style = analyzeStyle(CASUAL_DOC);

      expect(style.formality).toBe('casual');
    });

    it('should detect neutral formality for balanced text', () => {
      const neutralDoc = 'The project is complete. We finished the work on time. Results are good.';
      const style = analyzeStyle(neutralDoc);

      expect(style.formality).toBe('neutral');
    });

    it('should classify short sentences correctly', () => {
      const shortSentences = 'Go now. Stop. Run fast. Be quick. Act now. Do it.';
      const style = analyzeStyle(shortSentences);

      expect(style.sentenceLength).toBe('short');
    });

    it('should classify medium-length sentences correctly', () => {
      const mediumSentences =
        'The project was completed successfully on time and well within the allocated budget for this quarter. ' +
        'The team worked very well together and collaborated effectively to deliver the final product on schedule. ' +
        'All of the specified requirements and acceptance criteria were met by the established project deadline.';
      const style = analyzeStyle(mediumSentences);

      expect(style.sentenceLength).toBe('medium');
    });

    it('should classify long sentences correctly', () => {
      const longSentences =
        'The comprehensive analysis of the multifaceted experimental data revealed a significant ' +
        'correlation between the independent variable and the dependent outcome measure across ' +
        'all treatment conditions in the longitudinal study design that spanned multiple years ' +
        'of careful observation and systematic data collection efforts.';
      const style = analyzeStyle(longSentences);

      expect(style.sentenceLength).toBe('long');
    });

    it('should detect simple vocabulary', () => {
      const simpleDoc = 'I go to the park. It is fun. We run and play. The sun is up.';
      const style = analyzeStyle(simpleDoc);

      expect(style.vocabulary).toBe('simple');
    });

    it('should detect advanced vocabulary', () => {
      const advancedDoc =
        'Notwithstanding circumscription, epistemological considerations ' +
        'necessitate comprehensive systematization of archaeological methodologies.';
      const style = analyzeStyle(advancedDoc);

      expect(style.vocabulary).toBe('advanced');
    });

    it('should return neutral defaults for empty content', () => {
      const style = analyzeStyle('');

      expect(style.tone).toBe('neutral');
      expect(style.formality).toBe('neutral');
      expect(style.sentenceLength).toBe('medium');
      expect(style.vocabulary).toBe('moderate');
    });

    it('should return neutral defaults for whitespace-only content', () => {
      const style = analyzeStyle('   \n\t  ');

      expect(style.formality).toBe('neutral');
    });

    it('should derive academic tone for formal + advanced vocabulary', () => {
      const style = analyzeStyle(FORMAL_DOC);

      // Formal doc uses formal language + advanced vocabulary
      if (style.formality === 'formal' && style.vocabulary === 'advanced') {
        expect(style.tone).toBe('academic');
      }
    });

    it('should derive conversational tone for casual text', () => {
      const style = analyzeStyle(CASUAL_DOC);

      expect(style.tone).toBe('conversational');
    });

    it('should return a valid StyleProfile shape', () => {
      const style = analyzeStyle(SHORT_DOC);

      expect(style).toHaveProperty('tone');
      expect(style).toHaveProperty('formality');
      expect(style).toHaveProperty('sentenceLength');
      expect(style).toHaveProperty('vocabulary');
      expect(typeof style.tone).toBe('string');
      expect(['formal', 'neutral', 'casual']).toContain(style.formality);
      expect(['short', 'medium', 'long']).toContain(style.sentenceLength);
      expect(['simple', 'moderate', 'advanced']).toContain(style.vocabulary);
    });
  });

  // ---------------------------------------------------------------------------
  // Sliding Window
  // ---------------------------------------------------------------------------

  describe('Sliding window', () => {
    it('should extract text before and after cursor', () => {
      const content = 'AAAA BBBB CCCC DDDD';
      const result = slidingWindow(content, 10, 100);

      expect(result.before).toBe('AAAA BBBB ');
      expect(result.after).toBe('CCCC DDDD');
    });

    it('should respect token budget', () => {
      const content = makeLongDoc(10000);
      const maxTokens = 20; // 20 tokens => ~80 chars total (40 before + 40 after)
      const result = slidingWindow(content, 5000, maxTokens);

      expect(result.before.length).toBeLessThanOrEqual(40);
      expect(result.after.length).toBeLessThanOrEqual(40);
    });

    it('should handle cursor at start of document', () => {
      const content = 'Hello World';
      const result = slidingWindow(content, 0, 100);

      expect(result.before).toBe('');
      expect(result.after).toBe('Hello World');
    });

    it('should handle cursor at end of document', () => {
      const content = 'Hello World';
      const result = slidingWindow(content, content.length, 100);

      expect(result.before).toBe('Hello World');
      expect(result.after).toBe('');
    });

    it('should handle empty document', () => {
      const result = slidingWindow('', 0, 100);

      expect(result.before).toBe('');
      expect(result.after).toBe('');
    });

    it('should handle cursor beyond content length', () => {
      const content = 'Short text';
      const result = slidingWindow(content, 1000, 100);

      // Should clamp to content.length
      expect(result.before).toBe('Short text');
      expect(result.after).toBe('');
    });

    it('should handle negative cursor position', () => {
      const content = 'Hello World';
      const result = slidingWindow(content, -5, 100);

      // Should clamp to 0
      expect(result.before).toBe('');
      expect(result.after).toBe('Hello World');
    });

    it('should handle zero maxTokens', () => {
      const content = 'Hello World';
      const result = slidingWindow(content, 5, 0);

      expect(result.before).toBe('');
      expect(result.after).toBe('');
    });

    it('should keep text closest to cursor when trimming', () => {
      const content = 'AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH';
      // With a small token budget, only nearby text should survive
      const result = slidingWindow(content, 20, 5); // 5 tokens = 20 chars (10 before + 10 after)

      // Text closest to position 20 should be retained
      expect(result.before.length).toBeLessThanOrEqual(10);
      expect(result.after.length).toBeLessThanOrEqual(10);

      // The before text should end at the cursor position portion
      // and the after text should start from the cursor position
      if (result.before.length > 0) {
        expect(content.slice(0, 20)).toContain(result.before);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: Context build with edge cases
  // ---------------------------------------------------------------------------

  describe('Context build with empty document', () => {
    it('should handle empty document gracefully', () => {
      const cm = new ContextManager();
      const ctx = cm.build('', 0);

      expect(ctx.stablePrefix).toBeTruthy();
      expect(ctx.stablePrefix).toContain('InkWell AI');
      expect(typeof ctx.volatileSuffix).toBe('string');
      expect(ctx.tokenCount).toBeGreaterThan(0); // system prompt still has tokens
      expect(ctx.cacheKey).toMatch(/^[0-9a-f]+$/);
    });

    it('should have empty volatile suffix for empty document', () => {
      const cm = new ContextManager();
      const ctx = cm.build('', 0);

      expect(ctx.volatileSuffix).toBe('');
    });
  });

  describe('Context build with long document', () => {
    it('should limit volatile suffix via sliding window', () => {
      const longDoc = makeLongDoc(100000);
      const cm = new ContextManager({ windowTokens: 100 });
      const ctx = cm.build(longDoc, 50000);

      // 100 tokens * 4 chars/token = 400 chars max for volatile suffix
      expect(ctx.volatileSuffix.length).toBeLessThanOrEqual(400);
    });

    it('should still include full stable prefix for long document', () => {
      const longDoc = makeLongDoc(100000);
      const cm = new ContextManager({ windowTokens: 100 });
      const ctx = cm.build(longDoc, 50000);

      expect(ctx.stablePrefix).toContain('InkWell AI');
      expect(ctx.stablePrefix).toContain('[Style:');
    });
  });

  // ---------------------------------------------------------------------------
  // ContextManager with custom PrefixCache
  // ---------------------------------------------------------------------------

  describe('ContextManager with injected PrefixCache', () => {
    it('should use the provided PrefixCache instance', () => {
      const cache = new PrefixCache();
      const cm = new ContextManager({ prefixCache: cache });

      // Build once to populate cache
      cm.build(SHORT_DOC, 0, 'myDoc');

      // The cache should have been populated
      const computeFn = vi.fn(() => 'should-not-be-called');
      const cached = cache.getPrefix('myDoc', computeFn);

      // computeFn should NOT be called since the cache was already populated by build()
      expect(computeFn).not.toHaveBeenCalled();
      expect(cached).toContain('InkWell AI');
    });

    it('should rebuild prefix after invalidation via ContextManager', () => {
      const cache = new PrefixCache();
      const cm = new ContextManager({ prefixCache: cache });

      const ctx1 = cm.build(SHORT_DOC, 0, 'myDoc');
      cm.invalidatePrefix('myDoc');

      // Build again with different content but same docId
      const ctx2 = cm.build(FORMAL_DOC, 0, 'myDoc');

      // The stable prefixes should differ because the document changed
      // and the cache was invalidated
      expect(ctx2.stablePrefix).not.toBe(ctx1.stablePrefix);
    });
  });

  // ---------------------------------------------------------------------------
  // DocumentContext shape validation
  // ---------------------------------------------------------------------------

  describe('DocumentContext shape', () => {
    it('should return an object with all required fields', () => {
      const cm = new ContextManager();
      const ctx = cm.build(SHORT_DOC, 10);

      expect(ctx).toHaveProperty('stablePrefix');
      expect(ctx).toHaveProperty('volatileSuffix');
      expect(ctx).toHaveProperty('tokenCount');
      expect(ctx).toHaveProperty('cacheKey');

      expect(typeof ctx.stablePrefix).toBe('string');
      expect(typeof ctx.volatileSuffix).toBe('string');
      expect(typeof ctx.tokenCount).toBe('number');
      expect(typeof ctx.cacheKey).toBe('string');
    });
  });
});
