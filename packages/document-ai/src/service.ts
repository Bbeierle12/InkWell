/**
 * DocumentAI Service Implementation
 *
 * Orchestrates the full AI pipeline: routing -> context -> prompt -> stream -> parse.
 * Implements the DocumentAIService interface from types.ts.
 */
import {
  OperationType,
  ModelTarget,
  TOKEN_BUDGETS,
  type DocumentContext,
  type QueuedRequest,
  type AIEditInstruction,
  type WorkspaceRetriever,
} from '@inkwell/shared';
import type { DocumentAIService, LocalInferenceProvider } from './types';
import type { RoutingResult } from './router/types';
import { ModelRouter } from './router';
import { ContextManager } from './context';
import { ClaudeClient } from './claude/client';
import { collectAndParse } from './claude/response-parser';
import { getPromptTemplate, renderPrompt } from './prompts';

export interface CloudStreamRequest {
  model: ModelTarget;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  signal?: AbortSignal;
  stopSequences?: string[];
  system?: string;
  systemCacheControl?: boolean;
}

export type CloudStreamProvider = (
  request: CloudStreamRequest,
) => AsyncGenerator<string, void, unknown>;

export interface DocumentAIServiceOptions {
  apiKey: string;
  baseUrl?: string;
  isPrivate?: boolean;
  localProvider?: LocalInferenceProvider;
  workspaceRetriever?: WorkspaceRetriever;
  cloudStreamProvider?: CloudStreamProvider;
}

export interface AIOperationRequest {
  operation: OperationType;
  docContent: string;
  cursorPos: number;
  selection?: { from: number; to: number; text: string };
  targetTone?: string;
  docId?: string;
  rawTranscript?: string;
}

export interface AIOperationResult {
  instructions: AIEditInstruction[];
  raw: string;
  model: ModelTarget;
}

/**
 * Determine the token budget for a given operation type.
 */
function getTokenBudget(operation: OperationType): number {
  switch (operation) {
    case OperationType.InlineSuggest:
      return TOKEN_BUDGETS.inline;
    case OperationType.Critique:
      return TOKEN_BUDGETS.critique;
    default:
      return TOKEN_BUDGETS.documentOps;
  }
}

export class DocumentAIServiceImpl implements DocumentAIService {
  private router: ModelRouter;
  private context: ContextManager;
  private client: ClaudeClient;
  private isPrivate: boolean;
  private localProvider?: LocalInferenceProvider;
  private cloudStreamProvider?: CloudStreamProvider;
  private destroyed = false;

  constructor(options: DocumentAIServiceOptions) {
    this.router = new ModelRouter();
    this.context = new ContextManager({
      workspaceRetriever: options.workspaceRetriever,
    });
    this.client = new ClaudeClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
    });
    this.isPrivate = options.isPrivate ?? false;
    this.localProvider = options.localProvider;
    this.cloudStreamProvider = options.cloudStreamProvider;
  }

  route(operation: OperationType): ModelTarget {
    return this.router.route(operation, this.isPrivate).target;
  }

  async enqueue(request: QueuedRequest): Promise<void> {
    // Direct execution — queue management is handled externally by DocumentAIQueue
    void request;
  }

  async buildContext(docContent: string, cursorPos: number): Promise<DocumentContext> {
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
    const tokenBudget = getTokenBudget(request.operation);

    // For local-only targets, delegate to local provider if available
    if (routing.target === ModelTarget.Local) {
      if (this.localProvider?.isAvailable()) {
        const ctx = await this.context.build(
          request.docContent,
          request.cursorPos,
          request.docId,
          tokenBudget,
        );
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
    const ctx = await this.context.build(
      request.docContent,
      request.cursorPos,
      request.docId,
      tokenBudget,
    );

    // 3. Render prompt
    const template = getPromptTemplate(request.operation);
    const documentContext = ctx.workspaceSnippets
      ? ctx.stablePrefix + '\n\n' + ctx.workspaceSnippets + '\n\n' + ctx.volatileSuffix
      : ctx.stablePrefix + '\n\n' + ctx.volatileSuffix;
    const vars: Record<string, string> = {
      document_context: documentContext,
      selection: request.selection?.text ?? '',
    };
    if (request.targetTone) {
      vars.target_tone = request.targetTone;
    }
    if (request.rawTranscript) {
      vars.raw_transcript = request.rawTranscript;
    }
    vars.style_profile = ctx.stablePrefix;

    const { system, user } = renderPrompt(template, vars);

    // 4. Stream from Claude
    const stream = this.cloudStreamProvider
      ? this.cloudStreamProvider({
          model: routing.target,
          messages: [{ role: 'user', content: user }],
          system,
          systemCacheControl: true,
        })
      : this.client.stream(
          [{ role: 'user', content: user }],
          {
            model: routing.target,
            system,
            systemCacheControl: true,
          },
        );

    // 5. Collect and parse
    // VoiceRefine returns plain text, not JSON edit instructions
    if (request.operation === OperationType.VoiceRefine) {
      let raw = '';
      for await (const delta of stream) {
        raw += delta;
      }
      return { instructions: [], raw: raw.trim(), model: routing.target };
    }

    const { raw, instructions } = await collectAndParse(stream);

    return { instructions, raw, model: routing.target };
  }

  destroy(): void {
    this.destroyed = true;
  }
}
