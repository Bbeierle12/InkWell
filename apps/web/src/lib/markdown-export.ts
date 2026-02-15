/**
 * Markdown Export — Converts TipTap JSON to markdown.
 *
 * Simple walker that handles the common node types from StarterKit.
 */

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

function serializeMarks(text: string, marks?: TipTapNode['marks']): string {
  if (!marks || marks.length === 0) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `**${result}**`;
        break;
      case 'italic':
        result = `*${result}*`;
        break;
      case 'strike':
        result = `~~${result}~~`;
        break;
      case 'code':
        result = `\`${result}\``;
        break;
      case 'underline':
        // Markdown has no standard underline; use HTML
        result = `<u>${result}</u>`;
        break;
    }
  }
  return result;
}

function serializeInline(nodes?: TipTapNode[]): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text' && node.text) {
        return serializeMarks(node.text, node.marks);
      }
      if (node.type === 'hardBreak') {
        return '  \n';
      }
      return '';
    })
    .join('');
}

function serializeNode(node: TipTapNode): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(serializeNode).join('\n\n');

    case 'paragraph':
      return serializeInline(node.content);

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = '#'.repeat(level);
      return `${prefix} ${serializeInline(node.content)}`;
    }

    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `- ${serializeInline(item.content?.[0]?.content)}`)
        .join('\n');

    case 'orderedList':
      return (node.content ?? [])
        .map((item, i) => `${i + 1}. ${serializeInline(item.content?.[0]?.content)}`)
        .join('\n');

    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? '';
      const code = serializeInline(node.content);
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'blockquote':
      return (node.content ?? [])
        .map((child) => `> ${serializeNode(child)}`)
        .join('\n');

    case 'horizontalRule':
      return '---';

    default:
      return serializeInline(node.content);
  }
}

/**
 * Convert TipTap editor JSON to a markdown string.
 */
export function editorJsonToMarkdown(json: Record<string, unknown>): string {
  return serializeNode(json as unknown as TipTapNode);
}
