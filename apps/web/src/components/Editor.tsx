'use client';

/**
 * Editor Component
 *
 * Main TipTap editor wrapper that integrates the @inkwell/editor
 * package with React and the DocumentAI service.
 */

export function Editor() {
  // TODO: implement
  // - Initialize TipTap editor with Inkwell schema
  // - Load extensions: GhostText, SlashCommands, DiffPreview, AIUndo
  // - Bind to DocumentAI service via useDocumentAI hook
  // - Handle collaboration via Y.js
  return (
    <div className="prose prose-lg max-w-none">
      <div
        className="min-h-[60vh] outline-none"
        data-testid="inkwell-editor"
      >
        {/* TipTap editor mounts here */}
        <p className="text-gray-400">Loading editor...</p>
      </div>
    </div>
  );
}
