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
