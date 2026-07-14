'use client';

/**
 * EditorArea — paper canvas wrapping the TipTap editor.
 *
 * Renders a centered "page" on a textured canvas, with serif body
 * type, optional ruler, and page-number footer. Diff accept/reject
 * surfaces directly below the page.
 */

import { useMemo } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { useDocumentStore } from '@/lib/document-store';
import { useSettingsStore } from '@/lib/settings-store';
import { formatRelativeTime } from '@/lib/document-utils';
import { GrammarPopover } from '@/components/GrammarPopover';

interface EditorAreaProps {
  editor: Editor | null;
  hasDiffActive: boolean;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
}

function Ruler() {
  const ticks = useMemo(() => Array.from({ length: 16 }), []);
  return (
    <div className="inkwell-ruler" aria-hidden="true">
      <span style={{ width: 40 }}>in</span>
      {ticks.map((_, i) => (
        <div key={i} className={`inkwell-ruler-tick ${i % 2 === 0 ? 'major' : ''}`}>
          {i % 2 === 0 && <span>{Math.floor(i / 2)}</span>}
        </div>
      ))}
    </div>
  );
}

export function EditorArea({
  editor,
  hasDiffActive,
  onAcceptDiff,
  onRejectDiff,
}: EditorAreaProps) {
  const { title, lastSavedAt } = useDocumentStore();
  const showRuler = useSettingsStore((s) => s.showRuler);
  const lastEdited = lastSavedAt ? formatRelativeTime(lastSavedAt) : 'just now';

  return (
    <div className="inkwell-canvas">
      {showRuler && <Ruler />}
      <div className="inkwell-canvas-scroll">
        <article className="inkwell-page" data-testid="inkwell-editor-page">
          <header
            style={{
              marginBottom: 28,
              paddingBottom: 14,
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <h1
              style={{
                fontFamily: "'Source Serif 4', serif",
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
                margin: '0 0 6px',
                color: 'var(--ink)',
              }}
            >
              {title || 'Untitled'}
            </h1>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                fontFamily: 'Inter, sans-serif',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <span>Draft</span>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  background: 'var(--ink-4)',
                }}
              />
              <span>Last edited {lastEdited}</span>
            </div>
          </header>

          <div data-testid="inkwell-editor">
            <EditorContent editor={editor} />
            <GrammarPopover editor={editor} />
          </div>

          {editor && hasDiffActive && (
            <div
              className="inkwell-diff-actions"
              role="toolbar"
              aria-label="Diff actions"
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 8,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <button
                onClick={onAcceptDiff}
                className="inkwell-diff-accept"
                style={{ padding: '6px 14px', fontSize: 12 }}
                aria-label="Accept AI changes"
              >
                Accept
              </button>
              <button
                onClick={onRejectDiff}
                className="inkwell-diff-reject"
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  border: '1px solid var(--rule-2)',
                }}
                aria-label="Reject AI changes"
              >
                Reject
              </button>
            </div>
          )}

          <div className="inkwell-page-num">— 1 —</div>
        </article>
      </div>
    </div>
  );
}
