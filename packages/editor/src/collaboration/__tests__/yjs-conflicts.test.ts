/**
 * 1.4 Y.js Conflict Resolution Tests
 *
 * Verifies that Y.js CRDT conflict resolution produces consistent,
 * non-corrupted results under concurrent editing scenarios.
 */
import * as Y from 'yjs';

/**
 * Helper: sync two Y.Doc instances by exchanging state updates.
 */
function syncDocs(doc1: Y.Doc, doc2: Y.Doc): void {
  const update1 = Y.encodeStateAsUpdate(doc1);
  const update2 = Y.encodeStateAsUpdate(doc2);
  Y.applyUpdate(doc1, update2);
  Y.applyUpdate(doc2, update1);
}

/**
 * Helper: get the full text content of an XmlFragment.
 */
function getFragmentText(fragment: Y.XmlFragment): string {
  let text = '';
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlText) {
      text += child.toString();
    } else if (child instanceof Y.XmlElement) {
      text += child.toString();
    }
  }
  return text;
}

describe('1.4 Y.js Conflict Resolution', () => {
  it('should merge concurrent edits at different positions', () => {
    // Ref: Test Plan 1.4
    // Two users editing different positions should both be preserved
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Initialize both docs with the same content
    const text1 = doc1.getText('content');
    text1.insert(0, 'Hello World');

    // Sync so both docs have the same starting state
    syncDocs(doc1, doc2);
    const text2 = doc2.getText('content');

    // Concurrent edits at different positions (no sync between edits)
    text1.insert(0, 'A '); // Doc1: "A Hello World"
    text2.insert(11, '!'); // Doc2: "Hello World!"

    // Sync the docs
    syncDocs(doc1, doc2);

    // Both edits should be preserved
    const result1 = text1.toString();
    const result2 = text2.toString();

    expect(result1).toBe(result2); // Both docs converge
    expect(result1).toContain('A ');
    expect(result1).toContain('Hello World');
    expect(result1).toContain('!');
  });

  it('should handle concurrent edits at the same position deterministically', () => {
    // Ref: Test Plan 1.4
    // Two users inserting at the same position — Y.js resolves by client ID ordering
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Initialize with shared content
    const text1 = doc1.getText('content');
    text1.insert(0, 'Hello');
    syncDocs(doc1, doc2);
    const text2 = doc2.getText('content');

    // Concurrent edits at the SAME position
    text1.insert(5, ' Alice');
    text2.insert(5, ' Bob');

    // Capture full state updates (includes the initial "Hello" + concurrent edits)
    const update1 = Y.encodeStateAsUpdate(doc1);
    const update2 = Y.encodeStateAsUpdate(doc2);

    // Apply in one order to a fresh doc
    const docA = new Y.Doc();
    const textA = docA.getText('content');
    Y.applyUpdate(docA, update1);
    Y.applyUpdate(docA, update2);

    // Apply in reverse order to another fresh doc
    const docB = new Y.Doc();
    const textB = docB.getText('content');
    Y.applyUpdate(docB, update2);
    Y.applyUpdate(docB, update1);

    // Both texts should appear regardless of apply order
    const resultA = textA.toString();
    const resultB = textB.toString();

    // Y.js CRDT guarantees deterministic ordering regardless of apply order
    expect(resultA).toBe(resultB);
    expect(resultA).toContain('Alice');
    expect(resultA).toContain('Bob');
    expect(resultA).toContain('Hello');
  });

  it('should handle delete vs insert conflict consistently', () => {
    // Ref: Test Plan 1.4
    // One doc deletes a range, another inserts in that range
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Initialize
    const text1 = doc1.getText('content');
    text1.insert(0, 'Hello Beautiful World');
    syncDocs(doc1, doc2);
    const text2 = doc2.getText('content');

    // Doc1 deletes "Beautiful " (positions 6-16)
    text1.delete(6, 10);

    // Doc2 inserts "Very " inside the range that doc1 is deleting
    text2.insert(6, 'Very ');

    // Sync
    syncDocs(doc1, doc2);

    const result1 = text1.toString();
    const result2 = text2.toString();

    // Both docs must converge to the same result
    expect(result1).toBe(result2);

    // The result should not be corrupted — it should contain valid text
    // Y.js handles this by keeping the insert even if surrounding text was deleted
    expect(result1.length).toBeGreaterThan(0);
    expect(result1).toContain('Hello');
    expect(result1).toContain('World');
  });

  it('should handle offline sync without data loss', () => {
    // Ref: Test Plan 1.4
    // Many edits on each doc without syncing, then sync all at once
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    // Initialize
    const text1 = doc1.getText('content');
    text1.insert(0, 'Start');
    syncDocs(doc1, doc2);
    const text2 = doc2.getText('content');

    // Doc1 makes many edits "offline"
    text1.insert(5, ' Alpha');
    text1.insert(11, ' Beta');
    text1.insert(16, ' Gamma');

    // Doc2 makes many edits "offline"
    text2.insert(5, ' One');
    text2.insert(9, ' Two');
    text2.insert(13, ' Three');

    // Now sync all at once (simulating reconnection)
    syncDocs(doc1, doc2);

    const result1 = text1.toString();
    const result2 = text2.toString();

    // Both docs must converge
    expect(result1).toBe(result2);

    // No data loss: all inserted strings must be present
    expect(result1).toContain('Start');
    expect(result1).toContain('Alpha');
    expect(result1).toContain('Beta');
    expect(result1).toContain('Gamma');
    expect(result1).toContain('One');
    expect(result1).toContain('Two');
    expect(result1).toContain('Three');
  });
});
