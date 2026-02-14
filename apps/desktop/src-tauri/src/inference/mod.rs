//! Local inference module.
//!
//! Provides bindings to llama.cpp and whisper.cpp for on-device AI.
//! Uses trait-based abstraction so the FFI backend can be swapped for testing.

pub mod llama;
pub mod whisper;

use std::fmt;

/// Errors that can occur during local inference.
#[derive(Debug, Clone, PartialEq)]
pub enum InferenceError {
    /// No model has been loaded yet.
    ModelNotLoaded,
    /// The model file was not found at the given path.
    ModelNotFound(String),
    /// Inference failed with the given reason.
    InferenceFailed(String),
    /// The model file format is invalid.
    InvalidFormat(String),
    /// The model is currently busy with another request.
    ModelBusy,
    /// The operation was cancelled via abort signal.
    Cancelled,
    /// Audio input is invalid (empty, wrong format, etc.).
    InvalidAudio(String),
}

impl fmt::Display for InferenceError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            InferenceError::ModelNotLoaded => write!(f, "Model not loaded"),
            InferenceError::ModelNotFound(p) => write!(f, "Model file not found: {}", p),
            InferenceError::InferenceFailed(e) => write!(f, "Inference failed: {}", e),
            InferenceError::InvalidFormat(e) => write!(f, "Invalid model format: {}", e),
            InferenceError::ModelBusy => write!(f, "Model is busy with another request"),
            InferenceError::Cancelled => write!(f, "Operation was cancelled"),
            InferenceError::InvalidAudio(e) => write!(f, "Invalid audio: {}", e),
        }
    }
}

impl std::error::Error for InferenceError {}

/// Generation parameters for text inference.
#[derive(Debug, Clone)]
pub struct GenerationParams {
    /// Maximum number of tokens to generate.
    pub max_tokens: usize,
    /// Temperature for sampling (0.0 = greedy, 1.0 = default).
    pub temperature: f32,
    /// Top-p (nucleus) sampling threshold.
    pub top_p: f32,
    /// Stop sequences — generation halts when any is produced.
    pub stop_sequences: Vec<String>,
}

impl Default for GenerationParams {
    fn default() -> Self {
        Self {
            max_tokens: 256,
            temperature: 0.7,
            top_p: 0.9,
            stop_sequences: Vec::new(),
        }
    }
}

/// Result of a text generation operation.
#[derive(Debug, Clone)]
pub struct GenerationResult {
    /// The generated text.
    pub text: String,
    /// Number of tokens generated.
    pub tokens_generated: usize,
    /// Time to first token in milliseconds.
    pub time_to_first_token_ms: u64,
    /// Total generation time in milliseconds.
    pub total_time_ms: u64,
}

/// Result of a transcription operation.
#[derive(Debug, Clone)]
pub struct TranscriptionResult {
    /// The transcribed text.
    pub text: String,
    /// Detected language code (e.g., "en", "es").
    pub language: String,
    /// Confidence score [0.0, 1.0].
    pub confidence: f32,
    /// Processing time in milliseconds.
    pub duration_ms: u64,
}

/// Trait for LLM inference backends.
/// Allows swapping between real llama.cpp FFI and test mocks.
pub trait LlmBackend: Send + Sync {
    /// Load a model from the given path. Returns model metadata on success.
    fn load(&self, path: &str) -> Result<ModelMetadata, InferenceError>;

    /// Generate text from the given token-encoded prompt.
    fn generate(&self, prompt: &str, params: &GenerationParams) -> Result<GenerationResult, InferenceError>;

    /// Unload the current model, freeing resources.
    fn unload(&self) -> Result<(), InferenceError>;
}

/// Trait for speech-to-text backends.
pub trait SttBackend: Send + Sync {
    /// Load a whisper model from the given path.
    fn load(&self, path: &str) -> Result<ModelMetadata, InferenceError>;

    /// Transcribe PCM f32 audio at 16kHz mono.
    fn transcribe(&self, audio: &[f32], language_hint: Option<&str>) -> Result<TranscriptionResult, InferenceError>;

    /// Unload the model, freeing resources.
    fn unload(&self) -> Result<(), InferenceError>;
}

/// Metadata about a loaded model.
#[derive(Debug, Clone)]
pub struct ModelMetadata {
    /// Human-readable model name.
    pub name: String,
    /// Model size in bytes.
    pub size_bytes: u64,
    /// Context window size (for LLMs).
    pub context_length: Option<usize>,
}

