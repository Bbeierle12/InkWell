import { describe, it, expect } from 'vitest';
import { buildReplay, type ReplayEngine } from '../grammar-replay';

/**
 * These tests pin the ORDERING that `useGrammar`'s cold-start fix depends on:
 * setup() must resolve before any import call, so a `check()` that awaits
 * this promise never races a not-yet-replayed engine (spec §5.4a — dismissed
 * issues must stay gone across reload).
 */

/** Records call order/args instead of doing real work. */
function makeMockEngine() {
  const calls: string[] = [];
  const engine: ReplayEngine = {
    setup: async () => {
      calls.push('setup');
    },
    addWord: async (word: string) => {
      calls.push(`addWord:${word}`);
    },
    importIgnored: async (json: string) => {
      calls.push(`importIgnored:${json}`);
    },
  };
  return { engine, calls };
}

describe('buildReplay', () => {
  it('calls setup() before addWord() and importIgnored()', async () => {
    const { engine, calls } = makeMockEngine();

    await buildReplay(engine, ['foo', 'bar'], '["1","2"]');

    expect(calls[0]).toBe('setup');
    expect(calls).toContain('addWord:foo');
    expect(calls).toContain('addWord:bar');
    expect(calls).toContain('importIgnored:["1","2"]');
  });

  it('skips addWord() entirely when the dictionary is empty', async () => {
    const { engine, calls } = makeMockEngine();

    await buildReplay(engine, [], '["1"]');

    expect(calls).toEqual(['setup', 'importIgnored:["1"]']);
  });

  it('skips importIgnored() entirely when there is no ignore-list', async () => {
    const { engine, calls } = makeMockEngine();

    await buildReplay(engine, ['foo'], null);

    expect(calls).toEqual(['setup', 'addWord:foo']);
  });

  it('does nothing but setup() when there is no dictionary and no ignore-list', async () => {
    const { engine, calls } = makeMockEngine();

    await buildReplay(engine, [], undefined);

    expect(calls).toEqual(['setup']);
  });

  it('does not resolve until setup() resolves, even if setup() is slow', async () => {
    const calls: string[] = [];
    let resolveSetup!: () => void;
    const engine: ReplayEngine = {
      setup: () =>
        new Promise<void>((resolve) => {
          resolveSetup = () => {
            calls.push('setup');
            resolve();
          };
        }),
      addWord: async (word: string) => {
        calls.push(`addWord:${word}`);
      },
      importIgnored: async (json: string) => {
        calls.push(`importIgnored:${json}`);
      },
    };

    let done = false;
    const replay = buildReplay(engine, ['foo'], '["1"]').then(() => {
      done = true;
    });

    // Give any (incorrect) synchronous/microtask-only implementation a chance
    // to race ahead of setup() before it resolves.
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    expect(calls).toEqual([]);

    resolveSetup();
    await replay;

    expect(done).toBe(true);
    expect(calls).toEqual(['setup', 'addWord:foo', 'importIgnored:["1"]']);
  });
});
