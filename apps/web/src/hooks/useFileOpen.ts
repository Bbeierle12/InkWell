/**
 * useFileOpen Hook — Handles opening files from OS events and CLI args.
 *
 * On mount (if Tauri): checks for a pending file from CLI args.
 * Listens for file-open-request events from deep links and OS file associations.
 * Processes .inkwell, .md, and plain text files into the editor.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import {
  isTauriEnvironment,
  getPendingFile,
  onFileOpenRequest,
  readFileByPath,
} from '@/lib/tauri-bridge';
import { deserializeInkwellFile } from '@/lib/inkwell-format';
import { markdownToEditorJson } from '@/lib/markdown-import';
import { useDocumentStore } from '@/lib/document-store';

interface UseFileOpenOptions {
  editor: Editor | null;
}

export function useFileOpen({ editor }: UseFileOpenOptions) {
  const editorRef = useRef(editor);
  const { setTitle } = useDocumentStore();
  const processedRef = useRef(false);

  // Keep editor ref current
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const processFile = useCallback(
    async (path: string) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;

      const content = await readFileByPath(path);
      if (!content) return;

      if (path.endsWith('.inkwell')) {
        try {
          const schema = deserializeInkwellFile(content);
          currentEditor.commands.setContent(schema.content);
          setTitle(schema.metadata.title);
        } catch {
          // Fall back to plain text if deserialization fails
          currentEditor.commands.setContent(`<p>${content}</p>`);
        }
      } else if (path.endsWith('.md')) {
        const doc = markdownToEditorJson(content);
        currentEditor.commands.setContent(doc);
        // Derive title from filename
        const filename = path.split(/[/\\]/).pop() ?? 'Untitled';
        const titleFromFile = filename.replace(/\.md$/, '');
        if (titleFromFile) {
          setTitle(titleFromFile);
        }
      } else {
        // Plain text fallback
        currentEditor.commands.setContent(`<p>${content}</p>`);
      }
    },
    [setTitle],
  );

  useEffect(() => {
    if (!isTauriEnvironment()) return;

    let unlisten: (() => void) | null = null;

    async function setup() {
      // Check for CLI-arg pending file (cold start)
      if (!processedRef.current) {
        processedRef.current = true;
        const pending = await getPendingFile();
        if (pending) {
          // Wait briefly for editor to be ready
          const waitForEditor = () =>
            new Promise<void>((resolve) => {
              const check = () => {
                if (editorRef.current) {
                  resolve();
                } else {
                  setTimeout(check, 50);
                }
              };
              check();
            });
          await waitForEditor();
          await processFile(pending);
        }
      }

      // Listen for runtime file-open events (deep links, OS file associations)
      unlisten = await onFileOpenRequest((path) => {
        processFile(path);
      }) ?? null;
    }

    setup();

    return () => {
      unlisten?.();
    };
  }, [processFile]);
}
