'use client';

/**
 * DiffPreview Component
 *
 * Renders a before/after diff overlay for AI rewrite proposals.
 */

interface DiffPreviewProps {
  visible: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export function DiffPreview({ visible, onAccept, onReject }: DiffPreviewProps) {
  if (!visible) return null;

  // TODO: implement
  // - Show diff overlay with accept/reject buttons
  return (
    <div
      className="fixed bottom-4 right-4 shadow-lg rounded-lg p-4 border"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
      role="dialog"
      aria-label="AI suggested changes"
    >
      <p className="text-sm opacity-70">AI suggests changes</p>
      <div className="flex gap-2 mt-2" role="toolbar" aria-label="Diff actions">
        <button
          onClick={onAccept}
          className="px-3 py-1 bg-green-500 text-white rounded text-sm"
          aria-label="Accept AI changes"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="px-3 py-1 bg-red-500 text-white rounded text-sm"
          aria-label="Reject AI changes"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
