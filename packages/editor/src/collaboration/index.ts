/**
 * Collaboration Module
 *
 * Y.js + y-prosemirror bindings for real-time collaborative editing.
 */
import * as Y from 'yjs';

/**
 * Create a Y.js document pre-configured for collaborative ProseMirror editing.
 * Initializes the XmlFragment that y-prosemirror expects for document sync.
 */
export function createCollaborationDoc(): { ydoc: Y.Doc } {
  const ydoc = new Y.Doc();
  // Create the XmlFragment used by y-prosemirror for ProseMirror content sync
  ydoc.getXmlFragment('prosemirror');
  return { ydoc };
}

export { originFilter } from './origin-filter';
