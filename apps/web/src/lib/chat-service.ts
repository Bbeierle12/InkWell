/**
 * Chat Service
 *
 * Wraps a StreamingAIClient for multi-turn chat with inline edit support.
 * Uses <inkwell-edit> XML markers in the response to propose edits.
 * Document context is sent as a cached system prompt.
 */

import { parseAIResponse } from '@inkwell/document-ai';
import type { AIEditInstruction, ChatMessage } from '@inkwell/shared';

/**
 * Common streaming interface shared by ClaudeClient and OllamaClient.
 * Any client that produces an AsyncGenerator<string> from a messages array
 * can power the chat service.
 */
export interface StreamingAIClient {
  stream(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      maxTokens?: number;
      signal?: AbortSignal;
      stopSequences?: string[];
      system?: string;
      systemCacheControl?: boolean;
    },
  ): AsyncGenerator<string, void, unknown>;
}

const MAX_DOC_CHARS = 60_000;
const MAX_HISTORY_MESSAGES = 20;

interface ChatCallbacks {
  onDelta: (text: string) => void;
  onComplete: (text: string, edits: AIEditInstruction[]) => void;
  onError: (error: string) => void;
}

/**
 * Build the system prompt with document context.
 */
function buildSystemPrompt(docContent: string, selectedText?: string): string {
  const truncatedDoc =
    docContent.length > MAX_DOC_CHARS
      ? docContent.slice(0, MAX_DOC_CHARS) + '\n\n[Document truncated...]'
      : docContent;

  let prompt = `You are an AI writing assistant embedded in InkWell, a document editor. The user is chatting with you about their document.

<document>
${truncatedDoc}
</document>`;

  if (selectedText) {
    prompt += `

<selected-text>
${selectedText}
</selected-text>`;
  }

  prompt += `

When the user asks you to make changes to the document, wrap your edit instructions in <inkwell-edit> tags. Inside the tags, provide a JSON array of edit instructions with this format:
[{"type": "replace", "range": {"from": <start_pos>, "to": <end_pos>}, "content": "<new_text>"}]

Supported types: "replace", "insert", "delete".
- "replace": replaces text in the range with new content
- "insert": inserts content at the "from" position (set "to" equal to "from")
- "delete": removes text in the range (no "content" needed)

Character positions are 0-based offsets into the document text. Be precise with positions.

You can mix conversational text with edit blocks. For example:
"Here's a more concise version of that paragraph:
<inkwell-edit>[{"type":"replace","range":{"from":42,"to":156},"content":"New paragraph text here."}]</inkwell-edit>"

If the user just wants to chat or ask questions, respond normally without edit tags.`;

  return prompt;
}

/**
 * Convert ChatMessages to the API message format, trimming old messages
 * to stay within token budget.
 */
function prepareMessages(
  messages: ChatMessage[],
): Array<{ role: string; content: string }> {
  const trimmed =
    messages.length > MAX_HISTORY_MESSAGES
      ? messages.slice(-MAX_HISTORY_MESSAGES)
      : messages;

  return trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Extract <inkwell-edit> blocks from response text.
 * Returns the cleaned display text and parsed edit instructions.
 */
export function extractEditBlocks(text: string): {
  displayText: string;
  editInstructions: AIEditInstruction[];
} {
  const editRegex = /<inkwell-edit>([\s\S]*?)<\/inkwell-edit>/g;
  const allInstructions: AIEditInstruction[] = [];
  let displayText = text;

  let match;
  while ((match = editRegex.exec(text)) !== null) {
    const jsonStr = match[1].trim();
    const parsed = parseAIResponse(jsonStr);
    if (parsed.length > 0) {
      allInstructions.push(...parsed);
    }
  }

  // Remove edit blocks from display text
  displayText = displayText.replace(editRegex, '').trim();

  return { displayText, editInstructions: allInstructions };
}

export class ChatService {
  private client: StreamingAIClient;
  private abortController: AbortController | null = null;

  constructor(client: StreamingAIClient) {
    this.client = client;
  }

  /**
   * Stream a chat response given the conversation history and document context.
   */
  async streamChat(
    messages: ChatMessage[],
    docContent: string,
    selectedText: string | undefined,
    callbacks: ChatCallbacks,
  ): Promise<void> {
    this.abort();
    this.abortController = new AbortController();

    const systemPrompt = buildSystemPrompt(docContent, selectedText);
    const apiMessages = prepareMessages(messages);

    try {
      let fullText = '';
      const stream = this.client.stream(apiMessages, {
        system: systemPrompt,
        systemCacheControl: true,
        signal: this.abortController.signal,
        maxTokens: 4096,
      });

      for await (const delta of stream) {
        fullText += delta;
        callbacks.onDelta(delta);
      }

      const { displayText, editInstructions } = extractEditBlocks(fullText);
      callbacks.onComplete(displayText, editInstructions);
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        return;
      }
      callbacks.onError(
        err instanceof Error ? err.message : 'Chat request failed.',
      );
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Abort the current in-flight request.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  destroy(): void {
    this.abort();
  }
}
