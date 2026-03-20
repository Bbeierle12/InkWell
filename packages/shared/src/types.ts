/**
 * Shared type definitions for the Inkwell word processor.
 */

/** Classification of AI operations for routing and budgeting. */
export enum OperationType {
  InlineSuggest = 'inline_suggest',
  Rewrite = 'rewrite',
  Summarize = 'summarize',
  Expand = 'expand',
  Critique = 'deep_critique',
  VoiceRefine = 'voice_refine',
}

/** Target model for inference routing. */
export enum ModelTarget {
  Local = 'local',
  Sonnet = 'claude-sonnet-4-5-20250929',
  Opus = 'claude-opus-4-6',
}

/** User-configurable routing preference. */
export enum RoutingMode {
  Auto = 'auto',
  LocalOnly = 'local_only',
  CloudOnly = 'cloud_only',
}

/** A single edit instruction produced by AI output reconciliation. */
export interface AIEditInstruction {
  type: 'replace' | 'insert' | 'delete';
  range: { from: number; to: number };
  content?: string;
  marks?: MarkSpec[];
}

/** Opaque mark specification (matches ProseMirror MarkSpec shape). */
export interface MarkSpec {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Assembled document context sent with each AI request. */
export interface DocumentContext {
  /** System prompt + style profile + outline (cacheable prefix). */
  stablePrefix: string;
  /** Current paragraph + local breadcrumbs (volatile). */
  volatileSuffix: string;
  /** Formatted workspace snippets from related documents (or empty string). */
  workspaceSnippets: string;
  /** Total token count for this context payload. */
  tokenCount: number;
  /** Hash key for prompt-cache lookup. */
  cacheKey: string;
}

/** An item sitting in the AI request priority queue. */
export interface QueuedRequest {
  id: string;
  operation: OperationType;
  priority: number;
  payload: unknown;
  abortController: AbortController;
  createdAt: number;
  /** Content hash for deduplication. */
  contentHash: string;
}

// --- MCP Workspace Types ---

/** A search result from the workspace vector store. */
export interface SearchResult {
  chunkId: string;
  content: string;
  score: number;
  metadata: { path: string; offset: number; length: number };
}

/** Structural analysis of a document. */
export interface AnalysisResult {
  wordCount: number;
  sentenceCount: number;
  paragraphCount: number;
  headings: string[];
  readingLevel: string;
  estimatedReadTimeMinutes: number;
}

/** Style guide extraction result. */
export interface StyleGuideResult {
  tone: string;
  formality: string;
  sentenceLength: string;
  vocabulary: string;
  recommendations: string[];
}

/** Configuration for the MCP workspace server. */
export interface MCPServerConfig {
  dbPath?: string;
  watchDirectories?: string[];
}

/** A snippet retrieved from a related workspace document. */
export interface WorkspaceSnippet {
  content: string;
  path: string;
  score: number;
}

/** Interface for retrieving cross-document context from the workspace. */
export interface WorkspaceRetriever {
  retrieve(query: string, maxTokens: number): Promise<WorkspaceSnippet[]>;
}

// --- Reconciler Result Types ---

/** Reason why the reconciler rejected an edit batch. */
export enum ReconcileRejectionReason {
  ValidationFailed = 'validation_failed',
  OverlappingRanges = 'overlapping_ranges',
  StalePositionDeleted = 'stale_position_deleted',
  InvalidMarkType = 'invalid_mark_type',
  SchemaViolation = 'schema_violation',
  ApplyError = 'apply_error',
}

/** Successful reconciliation: all instructions applied cleanly. */
export interface ReconcileSuccess {
  ok: true;
  doc: unknown; // PMNode at runtime
  applied: AIEditInstruction[];
}

/** Failed reconciliation: no instructions were applied. */
export interface ReconcileFailure {
  ok: false;
  reason: ReconcileRejectionReason;
  message: string;
  instructionIndex?: number;
}

/** Discriminated union returned by Reconciler.apply(). */
export type ReconcileResult = ReconcileSuccess | ReconcileFailure;

// --- Voice Pipeline Types ---

/** States of the voice-to-text pipeline FSM. */
export enum VoicePipelineState {
  Idle = 'idle',
  Recording = 'recording',
  Transcribing = 'transcribing',
  Refining = 'refining',
  Done = 'done',
  Error = 'error',
}

/** Events that trigger voice pipeline state transitions. */
export enum VoicePipelineEvent {
  StartRecording = 'start_recording',
  StopRecording = 'stop_recording',
  TranscriptionComplete = 'transcription_complete',
  RefinementComplete = 'refinement_complete',
  ErrorOccurred = 'error_occurred',
  Reset = 'reset',
}

// --- Chat Types ---

/** Role in a chat conversation. */
export type ChatRole = 'user' | 'assistant';

/** A single message in the chat conversation. */
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  editInstructions?: AIEditInstruction[];
  editStatus?: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
}

/** Status of the chat streaming connection. */
export type ChatStreamStatus = 'idle' | 'streaming' | 'error';

/** Information about an Ollama model returned by /api/tags. */
export interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

/** Context data carried through the voice pipeline. */
export interface VoicePipelineContext {
  audioBlob: Blob | null;
  rawTranscript: string;
  refinedTranscript: string;
  error: string | null;
  durationMs: number;
}

/** A single state transition in the voice pipeline FSM. */
export interface VoicePipelineTransition {
  from: VoicePipelineState;
  to: VoicePipelineState;
  event: VoicePipelineEvent;
}
