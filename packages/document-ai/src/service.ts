/**
 * DocumentAI Service Implementation
 *
 * Orchestrates the full AI pipeline: routing -> context -> prompt -> stream -> parse.
 * Implements the DocumentAIService interface from types.ts.
 */
import {
  OperationType,
  ModelTarget,
  type DocumentContext,
  type QueuedRequest,
  type AIEditInstruction,
} from '@inkwell/shared';
import type { DocumentAIService, LocalInferenceProvider } from './types';
import type { RoutingResult } from './router/types';
import { ModelRouter } from './router';
import { ContextManager } from './context';
import { ClaudeClient } from './claude/client';
import { collectAndParse } from './claude/response-parser';
import { getPromptTemplate, renderPrompt } from './prompts';

export interface DocumentAIServiceOptions {
  apiKey: string;
  baseUrl?: string;
  isPrivate?: boolean;
  localProvider?: LocalInferenceProvider;
}

export interface AIOperationRequest {
  operation: OperationType;
  docContent: string;
  cursorPos: number;
  selection?: { from: number; to: number; text: string };
  targetTone?: string;
  docId?: string;
}

export interface AIOperationResult {
  instructions: AIEditInstruction[];
  raw: string;
  model: ModelTarget;
}

export class DocumentAIServiceImpl implements DocumentAIService {
  private router: ModelRouter;
  private context: ContextManager;
  private client: ClaudeClient;
  private isPrivate: boolean;
  private localProvider?: LocalInferenceProvider;
  private destroyed = false;

  constructor(options: DocumentAIServiceOptions) {
    this.router = new ModelRouter();
    this.context = new ContextManager();
    this.client = new ClaudeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    this.isPrivate = options.isPrivate ?? false;
    this.localProvider = options.localProvider;
  }

  route(operation: OperationType): ModelTarget {
    return this.router.route(operation, this.isPrivate).target;
  }

  async enqueue(request: QueuedRequest): Promise<void> {
    // Direct execution — queue management is handled externally by DocumentAIQueue
    void request;
  }

  buildContext(docContent: string, cursorPos: number): DocumentContext {
    return this.context.build(docContent, cursorPos);
  }

  reconcile(aiOutput: string, _currentDoc: unknown): unknown {
    // Reconciliation is handled by the Reconciler class directly
    return aiOutput;
  }

  /**
   * Execute a full AI operation pipeline.
   *
   * 1. Route the operation to determine model target
   * 2. Build document context
   * 3. Render prompt template
   * 4. Stream from Claude API
   * 5. Parse response into instructions
   */
  async executeOperation(request: AIOperationRequest): Promise<AIOperationResult> {
    if (this.destroyed) {
      throw new Error('DocumentAIService has been destroyed');
    }

    // 1. Route
    const routing: RoutingResult = this.router.route(request.operation, this.isPrivate);

    // For local-only targets, delegate to local provider if available
    if (routing.target === ModelTarget.Local) {
      if (this.localProvider?.isAvailable()) {
        const ctx = this.context.build(request.docContent, request.cursorPos, request.docId);
        const prompt = ctx.stablePrefix + '\n\n' + ctx.volatileSuffix;
        const result = await this.localProvider.generate(prompt, 128);
        return {
          instructions: [],
          raw: result?.text ?? '',
          model: ModelTarget.Local,
        };
      }
      return { instructions: [], raw: '', model: ModelTarget.Local };
    }

    // 2. Build context
    const ctx = this.context.build(request.docContent, request.cursorPos, request.docId);

    // 3. Render prompt
    const template = getPromptTemplate(request.operation);
    const vars: Record<string, string> = {
      document_context: ctx.stablePrefix + '\n\n' + ctx.volatileSuffix,
      selection: request.selection?.text ?? '',
    };
    if (request.targetTone) {
      vars.target_tone = request.targetTone;
    }
    vars.style_profile = ctx.stablePrefix;

    const { system, user } = renderPrompt(template, vars);

    // 4. Stream from Claude
    const stream = this.client.stream(
      [{ role: 'user', content: user }],
      {
        model: routing.target,
        system,
        systemCacheControl: true,
      },
    );

    // 5. Collect and parse
    const { raw, instructions } = await collectAndParse(stream);

    return { instructions, raw, model: routing.target };
  }

  destroy(): void {
    this.destroyed = true;
  }
}
