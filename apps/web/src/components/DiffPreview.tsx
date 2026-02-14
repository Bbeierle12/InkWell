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
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 border">
      <p className="text-sm text-gray-600">AI suggests changes</p>
      <div className="flex gap-2 mt-2">
        <button onClick={onAccept} className="px-3 py-1 bg-green-500 text-white rounded text-sm">
          Accept
        </button>
        <button onClick={onReject} className="px-3 py-1 bg-red-500 text-white rounded text-sm">
          Reject
        </button>
      </div>
    </div>
  );
}
