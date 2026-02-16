/**
 * Markdown Import — Converts markdown text to TipTap JSON.
 *
 * Line-based parser handling headings, bold/italic/code/strike inline marks,
 * bullet/ordered lists, blockquotes, code blocks, and horizontal rules.
 */

interface TipTapMark {
  type: string;
}

interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
}

/**
 * Parse inline markdown (bold, italic, code, strikethrough) into TipTap text nodes.
 */
function parseInline(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  // Regex for inline patterns (order matters: bold before italic)
  const inlineRegex =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)|(~~[^~]+~~)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add plain text before the match
    if (match.index > lastIndex) {
      const plain = text.slice(lastIndex, match.index);
      if (plain) {
        nodes.push({ type: 'text', text: plain });
      }
    }

    const full = match[0];

    if (match[1]) {
      // Inline code: `text`
      nodes.push({
        type: 'text',
        text: full.slice(1, -1),
        marks: [{ type: 'code' }],
      });
    } else if (match[2] || match[4]) {
      // Bold: **text** or __text__
      const inner = full.slice(2, -2);
      nodes.push({
        type: 'text',
        text: inner,
        marks: [{ type: 'bold' }],
      });
    } else if (match[3] || match[5]) {
      // Italic: *text* or _text_
      const inner = full.slice(1, -1);
      nodes.push({
        type: 'text',
        text: inner,
        marks: [{ type: 'italic' }],
      });
    } else if (match[6]) {
      // Strikethrough: ~~text~~
      nodes.push({
        type: 'text',
        text: full.slice(2, -2),
        marks: [{ type: 'strike' }],
      });
    }

    lastIndex = match.index + full.length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining) {
      nodes.push({ type: 'text', text: remaining });
    }
  }

  // If no nodes were created but we had text, return a plain text node
  if (nodes.length === 0 && text.length > 0) {
    nodes.push({ type: 'text', text });
  }

  return nodes;
}

/**
 * Convert a markdown string to TipTap editor JSON document.
 */
export function markdownToEditorJson(markdown: string): Record<string, unknown> {
  const lines = markdown.split('\n');
  const content: TipTapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (fenced)
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const codeText = codeLines.join('\n');
      const codeBlock: TipTapNode = {
        type: 'codeBlock',
        attrs: lang ? { language: lang } : {},
        content: codeText ? [{ type: 'text', text: codeText }] : undefined,
      };
      content.push(codeBlock);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      content.push({
        type: 'heading',
        attrs: { level },
        content: parseInline(text),
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      const quoteText = quoteLines.join('\n');
      const innerContent = parseInline(quoteText);
      content.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: innerContent.length > 0 ? innerContent : undefined,
          },
        ],
      });
      continue;
    }

    // Bullet list
    if (/^[-*+]\s/.test(line)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*+]\s/, '');
        const inlineNodes = parseInline(itemText);
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: inlineNodes.length > 0 ? inlineNodes : undefined,
            },
          ],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s/, '');
        const inlineNodes = parseInline(itemText);
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: inlineNodes.length > 0 ? inlineNodes : undefined,
            },
          ],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Default: paragraph
    const inlineNodes = parseInline(line);
    content.push({
      type: 'paragraph',
      content: inlineNodes.length > 0 ? inlineNodes : undefined,
    });
    i++;
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
  };
}
