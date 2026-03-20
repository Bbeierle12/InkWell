//! Tauri invoke commands (Rust <-> JS bridge).
//!
//! These commands are exposed to the JS frontend via `tauri::command`.
//! They handle serialization, validation, and delegation to the inference engines.

use base64::Engine as _;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Component, Path};
use tauri::{Emitter, State};

use crate::AppState;
use crate::inference::{GenerationParams, InferenceError};

const CLAUDE_KEYRING_SERVICE: &str = "com.inkwell.desktop";
const CLAUDE_KEYRING_ACCOUNT: &str = "claude_api_key";
const CLAUDE_OAUTH_KEYRING_ACCOUNT: &str = "claude_oauth_token_set";

/// Request payload for local inference.
#[derive(Debug, Clone, Deserialize)]
pub struct InferenceRequest {
    pub prompt: String,
    pub max_tokens: usize,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
}

/// Response payload from local inference.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InferenceResponse {
    pub text: String,
    pub tokens_generated: usize,
    pub time_ms: u64,
}

/// Request payload for audio transcription.
#[derive(Debug, Clone, Deserialize)]
pub struct TranscribeRequest {
    pub audio_path: String,
    pub language: Option<String>,
}

/// Response payload from audio transcription.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TranscribeResponse {
    pub text: String,
    pub language: String,
    pub duration_ms: u64,
}

/// System information response.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SystemInfo {
    pub platform: String,
    pub has_gpu: bool,
    pub available_memory_mb: u64,
}

/// Bridge error type that serializes cleanly to JSON for JS consumption.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BridgeError {
    pub code: String,
    pub message: String,
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

/// Request to load a model file.
#[derive(Debug, Clone, Deserialize)]
pub struct LoadModelRequest {
    pub path: String,
}

/// Response after loading a model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LoadModelResponse {
    pub name: String,
    pub size_bytes: u64,
    pub context_length: Option<usize>,
}

/// Event emitted during streaming generation.
#[derive(Debug, Clone, Serialize)]
pub struct StreamTokenEvent {
    pub token: String,
    pub done: bool,
}

/// Map an InferenceError to a bridge error code string.
pub fn error_code_from_inference_error(err: &InferenceError) -> String {
    match err {
        InferenceError::ModelNotLoaded => "MODEL_NOT_LOADED".to_string(),
        InferenceError::ModelNotFound(_) => "MODEL_NOT_FOUND".to_string(),
        InferenceError::InferenceFailed(_) => "INFERENCE_FAILED".to_string(),
        InferenceError::InvalidFormat(_) => "INVALID_FORMAT".to_string(),
        InferenceError::ModelBusy => "MODEL_BUSY".to_string(),
        InferenceError::Cancelled => "CANCELLED".to_string(),
        InferenceError::InvalidAudio(_) => "INVALID_AUDIO".to_string(),
    }
}

/// Convert an InferenceError into a serialized BridgeError string.
fn bridge_err(err: InferenceError) -> String {
    let be = BridgeError {
        code: error_code_from_inference_error(&err),
        message: err.to_string(),
    };
    serde_json::to_string(&be).unwrap_or_else(|_| be.to_string())
}

fn join_err(err: tokio::task::JoinError) -> String {
    bridge_err(InferenceError::InferenceFailed(format!(
        "Background task failed: {}",
        err
    )))
}

fn sanitize_model_filename(filename: &str) -> Result<String, String> {
    if filename.trim().is_empty() {
        return Err("Model filename cannot be empty".to_string());
    }

    if filename.contains('\\') {
        return Err("Invalid model filename".to_string());
    }

    let path = Path::new(filename);
    let mut components = path.components();
    let first = components.next();
    if first.is_none() || components.next().is_some() {
        return Err("Model filename must be a single file name".to_string());
    }

    let safe = match first.unwrap() {
        Component::Normal(name) => name.to_string_lossy().to_string(),
        _ => return Err("Invalid model filename".to_string()),
    };

    if safe.contains('\0') {
        return Err("Invalid model filename".to_string());
    }

    Ok(safe)
}

fn decode_f32_le_audio(audio_bytes: &[u8]) -> Result<Vec<f32>, InferenceError> {
    let chunks = audio_bytes.chunks_exact(4);
    if !chunks.remainder().is_empty() {
        return Err(InferenceError::InvalidAudio(
            "Audio byte length must be divisible by 4 (f32 PCM)".to_string(),
        ));
    }

    Ok(chunks
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

/// Validate an inference request before processing.
pub fn validate_inference_request(req: &InferenceRequest) -> Result<(), BridgeError> {
    if req.prompt.is_empty() {
        return Err(BridgeError {
            code: "INVALID_PROMPT".to_string(),
            message: "Prompt cannot be empty".to_string(),
        });
    }
    if req.max_tokens == 0 {
        return Err(BridgeError {
            code: "INVALID_MAX_TOKENS".to_string(),
            message: "max_tokens must be greater than 0".to_string(),
        });
    }
    if req.max_tokens > 16384 {
        return Err(BridgeError {
            code: "INVALID_MAX_TOKENS".to_string(),
            message: "max_tokens cannot exceed 16384".to_string(),
        });
    }
    if let Some(temp) = req.temperature {
        if !(0.0..=2.0).contains(&temp) {
            return Err(BridgeError {
                code: "INVALID_TEMPERATURE".to_string(),
                message: "temperature must be between 0.0 and 2.0".to_string(),
            });
        }
    }
    if let Some(top_p) = req.top_p {
        if !(0.0..=1.0).contains(&top_p) {
            return Err(BridgeError {
                code: "INVALID_TOP_P".to_string(),
                message: "top_p must be between 0.0 and 1.0".to_string(),
            });
        }
    }
    Ok(())
}

/// Validate a transcribe request.
pub fn validate_transcribe_request(req: &TranscribeRequest) -> Result<(), BridgeError> {
    if req.audio_path.is_empty() {
        return Err(BridgeError {
            code: "INVALID_AUDIO_PATH".to_string(),
            message: "audio_path cannot be empty".to_string(),
        });
    }
    if let Some(ref lang) = req.language {
        if lang.len() < 2 || lang.len() > 5 {
            return Err(BridgeError {
                code: "INVALID_LANGUAGE".to_string(),
                message: "language code must be 2-5 characters".to_string(),
            });
        }
    }
    Ok(())
}

/// Invoke local LLM inference from the JS frontend.
#[tauri::command]
pub async fn invoke_local_inference(
    state: State<'_, AppState>,
    request: InferenceRequest,
) -> Result<InferenceResponse, String> {
    validate_inference_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    let params = GenerationParams {
        max_tokens: request.max_tokens,
        temperature: request.temperature.unwrap_or(0.7),
        top_p: request.top_p.unwrap_or(0.9),
        stop_sequences: Vec::new(),
    };

    let llm = state.llm.clone();
    let prompt = request.prompt.clone();
    let result = tokio::task::spawn_blocking(move || llm.generate(&prompt, &params))
        .await
        .map_err(join_err)?
        .map_err(bridge_err)?;

    Ok(InferenceResponse {
        text: result.text,
        tokens_generated: result.tokens_generated,
        time_ms: result.total_time_ms,
    })
}

/// Invoke audio transcription from the JS frontend.
#[tauri::command]
pub async fn transcribe_audio(
    state: State<'_, AppState>,
    request: TranscribeRequest,
) -> Result<TranscribeResponse, String> {
    validate_transcribe_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    // Read audio file as PCM f32 (simplified: assumes raw f32 PCM at 16kHz)
    let audio_bytes = tokio::fs::read(&request.audio_path).await.map_err(|e| {
        bridge_err(InferenceError::InvalidAudio(format!(
            "Failed to read audio file: {}", e
        )))
    })?;

    let audio = decode_f32_le_audio(&audio_bytes).map_err(bridge_err)?;

    let stt = state.stt.clone();
    let language = request.language.clone();
    let result = tokio::task::spawn_blocking(move || {
        stt.transcribe(&audio, language.as_deref())
    })
    .await
    .map_err(join_err)?
    .map_err(bridge_err)?;

    Ok(TranscribeResponse {
        text: result.text,
        language: result.language,
        duration_ms: result.duration_ms,
    })
}

/// Get system information for capability detection.
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    Ok(SystemInfo {
        platform: std::env::consts::OS.to_string(),
        has_gpu: detect_gpu(),
        available_memory_mb: get_available_memory_mb(),
    })
}

/// Load a GGUF model file for LLM inference.
#[tauri::command]
pub async fn load_llm_model(
    state: State<'_, AppState>,
    request: LoadModelRequest,
) -> Result<LoadModelResponse, String> {
    if request.path.is_empty() {
        return Err(bridge_err(InferenceError::InvalidFormat(
            "Model path cannot be empty".to_string(),
        )));
    }

    let metadata = state.llm.load_model(&request.path).map_err(bridge_err)?;

    Ok(LoadModelResponse {
        name: metadata.name,
        size_bytes: metadata.size_bytes,
        context_length: metadata.context_length,
    })
}

/// Unload the current LLM model and free resources.
#[tauri::command]
pub async fn unload_llm_model(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.llm.unload().map_err(bridge_err)
}

/// Streaming LLM generation via Tauri events.
///
/// Emits `llm-token` events with `StreamTokenEvent` payloads as tokens
/// are generated, then a final event with `done: true`.
#[tauri::command]
pub async fn llm_stream(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    request: InferenceRequest,
) -> Result<InferenceResponse, String> {
    validate_inference_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    let params = GenerationParams {
        max_tokens: request.max_tokens,
        temperature: request.temperature.unwrap_or(0.7),
        top_p: request.top_p.unwrap_or(0.9),
        stop_sequences: Vec::new(),
    };

    let app_handle = app.clone();
    let result = state.llm.generate_streaming(
        &request.prompt,
        &params,
        &mut |token| {
            let _ = app_handle.emit("llm-token", StreamTokenEvent {
                token: token.to_string(),
                done: false,
            });
        },
    ).map_err(bridge_err)?;

    // Emit final done event
    let _ = app.emit("llm-token", StreamTokenEvent {
        token: String::new(),
        done: true,
    });

    Ok(InferenceResponse {
        text: result.text,
        tokens_generated: result.tokens_generated,
        time_ms: result.total_time_ms,
    })
}

/// Load a Whisper model file for speech-to-text.
#[tauri::command]
pub async fn load_whisper_model(
    state: State<'_, AppState>,
    request: LoadModelRequest,
) -> Result<LoadModelResponse, String> {
    if request.path.is_empty() {
        return Err(bridge_err(InferenceError::InvalidFormat(
            "Model path cannot be empty".to_string(),
        )));
    }

    let metadata = state.stt.load_model(&request.path).map_err(bridge_err)?;

    Ok(LoadModelResponse {
        name: metadata.name,
        size_bytes: metadata.size_bytes,
        context_length: metadata.context_length,
    })
}

/// Unload the current Whisper model and free resources.
#[tauri::command]
pub async fn unload_whisper_model(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.stt.unload().map_err(bridge_err)
}

/// Transcribe audio with partial result events.
///
/// Emits `whisper-partial` events as segments are transcribed.
#[tauri::command]
pub async fn transcribe_with_partials(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    request: TranscribeRequest,
) -> Result<TranscribeResponse, String> {
    validate_transcribe_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    let audio_bytes = tokio::fs::read(&request.audio_path).await.map_err(|e| {
        bridge_err(InferenceError::InvalidAudio(format!(
            "Failed to read audio file: {}", e
        )))
    })?;

    let audio = decode_f32_le_audio(&audio_bytes).map_err(bridge_err)?;
    let stt = state.stt.clone();
    let language = request.language.clone();
    let app_handle = app.clone();

    let result = tokio::task::spawn_blocking(move || {
        stt.transcribe_streaming(
            &audio,
            language.as_deref(),
            &mut |partial| {
                let _ = app_handle.emit("whisper-partial", partial.to_string());
            },
        )
    })
    .await
    .map_err(join_err)?
    .map_err(bridge_err)?;

    Ok(TranscribeResponse {
        text: result.text,
        language: result.language,
        duration_ms: result.duration_ms,
    })
}

/// Request payload for audio transcription from raw PCM bytes.
#[derive(Debug, Clone, Deserialize)]
pub struct TranscribeAudioBytesRequest {
    pub samples: Vec<f32>,
    pub language: Option<String>,
}

/// Validate a transcribe-audio-bytes request.
pub fn validate_transcribe_audio_bytes_request(req: &TranscribeAudioBytesRequest) -> Result<(), BridgeError> {
    if req.samples.is_empty() {
        return Err(BridgeError {
            code: "INVALID_AUDIO".to_string(),
            message: "Audio samples cannot be empty".to_string(),
        });
    }
    if let Some(ref lang) = req.language {
        if lang.len() < 2 || lang.len() > 5 {
            return Err(BridgeError {
                code: "INVALID_LANGUAGE".to_string(),
                message: "language code must be 2-5 characters".to_string(),
            });
        }
    }
    Ok(())
}

/// Invoke audio transcription from raw PCM f32 samples sent directly from JS.
///
/// Avoids the need for temp files — the JS frontend sends Float32Array data
/// as a regular array, which Tauri deserializes to Vec<f32>.
#[tauri::command]
pub async fn transcribe_audio_bytes(
    state: State<'_, AppState>,
    request: TranscribeAudioBytesRequest,
) -> Result<TranscribeResponse, String> {
    validate_transcribe_audio_bytes_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    let stt = state.stt.clone();
    let language = request.language.clone();
    let samples = request.samples.clone();
    let result = tokio::task::spawn_blocking(move || {
        stt.transcribe(&samples, language.as_deref())
    })
    .await
    .map_err(join_err)?
    .map_err(bridge_err)?;

    Ok(TranscribeResponse {
        text: result.text,
        language: result.language,
        duration_ms: result.duration_ms,
    })
}

// ─────────────────────── File Dialog Commands ─────────────────────────

/// Filter specification for file dialogs.
#[derive(Debug, Clone, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

/// Show a native save file dialog and return the selected path.
#[tauri::command]
pub async fn save_file_dialog(filters: Vec<FileFilter>) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new();

    for f in &filters {
        let ext_refs: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter(&f.name, &ext_refs);
    }

    match dialog.save_file().await {
        Some(handle) => Ok(Some(handle.path().to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// Show a native open file dialog and return the selected path.
#[tauri::command]
pub async fn open_file_dialog(filters: Vec<FileFilter>) -> Result<Option<String>, String> {
    let mut dialog = rfd::AsyncFileDialog::new();

    for f in &filters {
        let ext_refs: Vec<&str> = f.extensions.iter().map(|s| s.as_str()).collect();
        dialog = dialog.add_filter(&f.name, &ext_refs);
    }

    match dialog.pick_file().await {
        Some(handle) => Ok(Some(handle.path().to_string_lossy().to_string())),
        None => Ok(None),
    }
}

/// Write text content to a file at the given path.
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Read text content from a file at the given path.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Try UTF-8 first, fall back to encoding detection
    match String::from_utf8(bytes.clone()) {
        Ok(s) => Ok(s),
        Err(_) => {
            let (cow, _, _) = encoding_rs::UTF_8.decode(&bytes);
            Ok(cow.into_owned())
        }
    }
}

// ─────────────────────── Model Management Commands ────────────────────

/// Information about a model file in the models directory.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelInfo {
    pub name: String,
    pub filename: String,
    pub size_bytes: u64,
    pub model_type: String, // "llm" or "whisper"
}

/// Status of models on disk.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ModelsStatus {
    pub models_dir: String,
    pub llm_models: Vec<ModelInfo>,
    pub whisper_models: Vec<ModelInfo>,
    pub has_llm: bool,
    pub has_whisper: bool,
}

/// Progress event emitted during model download.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressEvent {
    pub model_name: String,
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub progress_pct: Option<f64>,
    pub done: bool,
    pub error: Option<String>,
}

/// Get the platform-specific models directory path.
///
/// - Linux: ~/.local/share/inkwell/models
/// - macOS: ~/Library/Application Support/inkwell/models
/// - Windows: %APPDATA%/inkwell/models
#[tauri::command]
pub async fn get_models_dir() -> Result<String, String> {
    let base = dirs::data_dir().ok_or("Could not determine data directory")?;
    let models_dir = base.join("inkwell").join("models");

    // Ensure directory exists
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    Ok(models_dir.to_string_lossy().to_string())
}

/// Check which models are installed in the models directory.
#[tauri::command]
pub async fn check_models_status() -> Result<ModelsStatus, String> {
    let base = dirs::data_dir().ok_or("Could not determine data directory")?;
    let models_dir = base.join("inkwell").join("models");

    // Create dir if it doesn't exist
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let mut llm_models = Vec::new();
    let mut whisper_models = Vec::new();

    // Scan directory for model files
    if let Ok(mut entries) = tokio::fs::read_dir(&models_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let filename = path.file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            if let Ok(metadata) = entry.metadata().await {
                let size_bytes = metadata.len();
                let name = path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                if filename.ends_with(".gguf") {
                    llm_models.push(ModelInfo {
                        name,
                        filename,
                        size_bytes,
                        model_type: "llm".to_string(),
                    });
                } else if filename.ends_with(".bin")
                    && (filename.contains("whisper") || filename.starts_with("ggml-"))
                {
                    whisper_models.push(ModelInfo {
                        name,
                        filename,
                        size_bytes,
                        model_type: "whisper".to_string(),
                    });
                }
            }
        }
    }

    let has_llm = !llm_models.is_empty();
    let has_whisper = !whisper_models.is_empty();

    Ok(ModelsStatus {
        models_dir: models_dir.to_string_lossy().to_string(),
        llm_models,
        whisper_models,
        has_llm,
        has_whisper,
    })
}

/// Download a model from a URL to the models directory with progress events.
#[tauri::command]
pub async fn download_model(
    app: tauri::AppHandle,
    url: String,
    filename: String,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let base = dirs::data_dir().ok_or("Could not determine data directory")?;
    let models_dir = base.join("inkwell").join("models");
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|e| format!("Failed to create models directory: {}", e))?;

    let safe_filename = sanitize_model_filename(&filename)?;
    let dest = models_dir.join(&safe_filename);
    let model_name = safe_filename.clone();

    let client = reqwest::Client::new();
    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_bytes = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Download stream error: {}", e))?;

        use tokio::io::AsyncWriteExt;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        let progress_pct = total_bytes.map(|total| (downloaded as f64 / total as f64) * 100.0);

        let _ = app.emit("download-progress", DownloadProgressEvent {
            model_name: model_name.clone(),
            bytes_downloaded: downloaded,
            total_bytes,
            progress_pct,
            done: false,
            error: None,
        });
    }

    // Emit completion event
    let _ = app.emit("download-progress", DownloadProgressEvent {
        model_name: model_name.clone(),
        bytes_downloaded: downloaded,
        total_bytes,
        progress_pct: Some(100.0),
        done: true,
        error: None,
    });

    Ok(dest.to_string_lossy().to_string())
}

// ─────────────────────── File-Open Pipeline ───────────────────────────

/// Get and clear the pending file path from CLI args or OS file-open events.
///
/// This is a one-shot consumption: the pending file is cleared after reading
/// so subsequent calls return None.
#[tauri::command]
pub async fn get_pending_file(
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let mut pending = state.pending_file.lock().map_err(|e| e.to_string())?;
    Ok(pending.take())
}

fn claude_keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CLAUDE_KEYRING_SERVICE, CLAUDE_KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to initialize secure credential storage: {}", e))
}

/// Get Claude API key from secure OS credential storage.
#[tauri::command]
pub async fn secure_get_claude_api_key() -> Result<Option<String>, String> {
    let entry = claude_keyring_entry()?;
    match entry.get_password() {
        Ok(api_key) => Ok(Some(api_key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read Claude API key from secure storage: {}", e)),
    }
}

/// Store Claude API key in secure OS credential storage.
#[tauri::command]
pub async fn secure_set_claude_api_key(api_key: String) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("Claude API key cannot be empty".to_string());
    }

    let entry = claude_keyring_entry()?;
    entry
        .set_password(trimmed)
        .map_err(|e| format!("Failed to store Claude API key in secure storage: {}", e))
}

/// Remove Claude API key from secure OS credential storage.
#[tauri::command]
pub async fn secure_clear_claude_api_key() -> Result<(), String> {
    let entry = claude_keyring_entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!(
            "Failed to clear Claude API key from secure storage: {}",
            e
        )),
    }
}

#[derive(Debug, Clone)]
struct ClaudeOAuthConfig {
    enabled: bool,
    auth_url: String,
    token_url: String,
    revoke_url: Option<String>,
    api_base_url: String,
    client_id: String,
    redirect_uri: String,
    scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredClaudeOAuthTokens {
    access_token: String,
    refresh_token: Option<String>,
    expires_at_epoch_ms: Option<u64>,
    token_type: Option<String>,
    scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeAuthStatus {
    pub supported: bool,
    pub connected: bool,
    pub method: String,
    pub can_refresh: bool,
    pub expires_at_epoch_ms: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSignInStartResult {
    pub started: bool,
    pub auth_url: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeInvokeRequestMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeInvokeViaSubscriptionRequest {
    pub model: String,
    pub messages: Vec<ClaudeInvokeRequestMessage>,
    pub max_tokens: usize,
    pub system: Option<String>,
    pub stop_sequences: Option<Vec<String>>,
    pub system_cache_control: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeOAuthTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: Option<String>,
    scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessagesResponseBlock {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ClaudeMessagesResponse {
    content: Vec<ClaudeMessagesResponseBlock>,
}

fn now_epoch_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    duration.as_millis() as u64
}

fn redact_sensitive(message: &str) -> String {
    message
        .split_whitespace()
        .map(|part| {
            if part.starts_with("sk-ant-") {
                "sk-ant-[REDACTED]".to_string()
            } else if part.starts_with("Bearer") {
                "Bearer [REDACTED]".to_string()
            } else if part.len() > 24 && part.chars().all(|c| c.is_ascii_alphanumeric() || "-._~+/=".contains(c)) {
                "[REDACTED]".to_string()
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn oauth_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(CLAUDE_KEYRING_SERVICE, CLAUDE_OAUTH_KEYRING_ACCOUNT)
        .map_err(|e| format!("Failed to initialize OAuth credential storage: {}", e))
}

fn load_oauth_config() -> ClaudeOAuthConfig {
    let enabled = std::env::var("INKWELL_CLAUDE_OAUTH_ENABLED")
        .ok()
        .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
        .unwrap_or(false);

    ClaudeOAuthConfig {
        enabled,
        auth_url: std::env::var("INKWELL_CLAUDE_OAUTH_AUTH_URL")
            .unwrap_or_else(|_| "https://claude.ai/oauth/authorize".to_string()),
        token_url: std::env::var("INKWELL_CLAUDE_OAUTH_TOKEN_URL")
            .unwrap_or_else(|_| "https://claude.ai/oauth/token".to_string()),
        revoke_url: std::env::var("INKWELL_CLAUDE_OAUTH_REVOKE_URL").ok(),
        api_base_url: std::env::var("INKWELL_CLAUDE_OAUTH_API_BASE_URL")
            .unwrap_or_else(|_| "https://api.anthropic.com".to_string()),
        client_id: std::env::var("INKWELL_CLAUDE_OAUTH_CLIENT_ID").unwrap_or_default(),
        redirect_uri: std::env::var("INKWELL_CLAUDE_OAUTH_REDIRECT_URI")
            .unwrap_or_else(|_| "inkwell://auth/callback".to_string()),
        scope: std::env::var("INKWELL_CLAUDE_OAUTH_SCOPE")
            .unwrap_or_else(|_| "openid profile offline_access".to_string()),
    }
}

fn load_stored_oauth_tokens() -> Result<Option<StoredClaudeOAuthTokens>, String> {
    let entry = oauth_entry()?;
    match entry.get_password() {
        Ok(raw) => serde_json::from_str::<StoredClaudeOAuthTokens>(&raw)
            .map(Some)
            .map_err(|e| format!("Invalid stored OAuth token payload: {}", e)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read OAuth tokens: {}", e)),
    }
}

fn save_stored_oauth_tokens(tokens: &StoredClaudeOAuthTokens) -> Result<(), String> {
    let entry = oauth_entry()?;
    let payload = serde_json::to_string(tokens)
        .map_err(|e| format!("Failed to serialize OAuth tokens: {}", e))?;
    entry
        .set_password(&payload)
        .map_err(|e| format!("Failed to store OAuth tokens: {}", e))
}

fn clear_stored_oauth_tokens() -> Result<(), String> {
    let entry = oauth_entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to clear OAuth tokens: {}", e)),
    }
}

fn create_pkce_verifier() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn create_pkce_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

fn is_token_expired(expires_at_epoch_ms: Option<u64>) -> bool {
    match expires_at_epoch_ms {
        Some(expiry) => now_epoch_ms().saturating_add(30_000) >= expiry,
        None => false,
    }
}

fn parse_oauth_callback(callback_url: &str) -> Result<(String, String), String> {
    let url = url::Url::parse(callback_url)
        .map_err(|e| format!("Invalid callback URL: {}", e))?;

    let mut code: Option<String> = None;
    let mut state: Option<String> = None;
    for (k, v) in url.query_pairs() {
        if k == "code" {
            code = Some(v.to_string());
        } else if k == "state" {
            state = Some(v.to_string());
        }
    }

    match (code, state) {
        (Some(c), Some(s)) if !c.is_empty() && !s.is_empty() => Ok((c, s)),
        _ => Err("OAuth callback is missing code/state".to_string()),
    }
}

async fn exchange_authorization_code(
    config: &ClaudeOAuthConfig,
    code: &str,
    verifier: &str,
) -> Result<StoredClaudeOAuthTokens, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "authorization_code"),
        ("client_id", config.client_id.as_str()),
        ("code", code),
        ("redirect_uri", config.redirect_uri.as_str()),
        ("code_verifier", verifier),
    ];

    let response = client
        .post(&config.token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Token exchange failed with HTTP {}: {}",
            status,
            redact_sensitive(&text),
        ));
    }

    let parsed = response
        .json::<ClaudeOAuthTokenResponse>()
        .await
        .map_err(|e| format!("Token exchange response parse failed: {}", e))?;

    let expiry = parsed
        .expires_in
        .map(|seconds| now_epoch_ms().saturating_add(seconds.saturating_mul(1000)));

    Ok(StoredClaudeOAuthTokens {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_at_epoch_ms: expiry,
        token_type: parsed.token_type,
        scope: parsed.scope,
    })
}

async fn refresh_access_token(
    config: &ClaudeOAuthConfig,
    refresh_token: &str,
) -> Result<StoredClaudeOAuthTokens, String> {
    let client = reqwest::Client::new();
    let params = [
        ("grant_type", "refresh_token"),
        ("client_id", config.client_id.as_str()),
        ("refresh_token", refresh_token),
    ];

    let response = client
        .post(&config.token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Token refresh failed with HTTP {}: {}",
            status,
            redact_sensitive(&text),
        ));
    }

    let parsed = response
        .json::<ClaudeOAuthTokenResponse>()
        .await
        .map_err(|e| format!("Token refresh response parse failed: {}", e))?;

    let expiry = parsed
        .expires_in
        .map(|seconds| now_epoch_ms().saturating_add(seconds.saturating_mul(1000)));

    Ok(StoredClaudeOAuthTokens {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token.or_else(|| Some(refresh_token.to_string())),
        expires_at_epoch_ms: expiry,
        token_type: parsed.token_type,
        scope: parsed.scope,
    })
}

async fn current_claude_auth_status() -> ClaudeAuthStatus {
    let config = load_oauth_config();
    if !config.enabled || config.client_id.trim().is_empty() {
        return ClaudeAuthStatus {
            supported: false,
            connected: false,
            method: "claude_subscription".to_string(),
            can_refresh: false,
            expires_at_epoch_ms: None,
            message: Some("Claude subscription sign-in is disabled in this build.".to_string()),
        };
    }

    match load_stored_oauth_tokens() {
        Ok(Some(tokens)) => ClaudeAuthStatus {
            supported: true,
            connected: !tokens.access_token.is_empty() && !is_token_expired(tokens.expires_at_epoch_ms),
            method: "claude_subscription".to_string(),
            can_refresh: tokens.refresh_token.is_some(),
            expires_at_epoch_ms: tokens.expires_at_epoch_ms,
            message: None,
        },
        Ok(None) => ClaudeAuthStatus {
            supported: true,
            connected: false,
            method: "claude_subscription".to_string(),
            can_refresh: false,
            expires_at_epoch_ms: None,
            message: None,
        },
        Err(e) => ClaudeAuthStatus {
            supported: true,
            connected: false,
            method: "claude_subscription".to_string(),
            can_refresh: false,
            expires_at_epoch_ms: None,
            message: Some(redact_sensitive(&e)),
        },
    }
}

/// Get current Claude account auth status.
#[tauri::command]
pub async fn auth_get_claude_status() -> Result<ClaudeAuthStatus, String> {
    Ok(current_claude_auth_status().await)
}

/// Start Claude subscription sign-in using OAuth PKCE in the system browser.
#[tauri::command]
pub async fn auth_start_claude_sign_in(
    state: State<'_, AppState>,
) -> Result<ClaudeSignInStartResult, String> {
    let config = load_oauth_config();
    if !config.enabled || config.client_id.trim().is_empty() {
        return Ok(ClaudeSignInStartResult {
            started: false,
            auth_url: None,
            message: Some("Claude sign-in is not enabled for this build.".to_string()),
        });
    }

    let code_verifier = create_pkce_verifier();
    let code_challenge = create_pkce_challenge(&code_verifier);
    let oauth_state = create_pkce_verifier();

    {
        let mut session = state.auth_pkce.lock().map_err(|e| e.to_string())?;
        *session = Some(crate::OAuthPkceSession {
            state: oauth_state.clone(),
            code_verifier: code_verifier.clone(),
            created_at_epoch_ms: now_epoch_ms(),
        });
    }

    let mut auth_url = url::Url::parse(&config.auth_url)
        .map_err(|e| format!("Invalid OAuth auth URL: {}", e))?;
    auth_url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &config.client_id)
        .append_pair("redirect_uri", &config.redirect_uri)
        .append_pair("scope", &config.scope)
        .append_pair("code_challenge", &code_challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &oauth_state);

    webbrowser::open(auth_url.as_str())
        .map_err(|e| format!("Failed to open browser for sign-in: {}", redact_sensitive(&e.to_string())))?;

    Ok(ClaudeSignInStartResult {
        started: true,
        auth_url: Some(auth_url.to_string()),
        message: Some("Browser opened for Claude sign-in.".to_string()),
    })
}

/// Complete Claude sign-in using OAuth callback URL from deep-link event.
#[tauri::command]
pub async fn auth_complete_claude_sign_in(
    state: State<'_, AppState>,
    callback_url: String,
) -> Result<ClaudeAuthStatus, String> {
    let config = load_oauth_config();
    if !config.enabled || config.client_id.trim().is_empty() {
        return Ok(current_claude_auth_status().await);
    }

    let (code, returned_state) = parse_oauth_callback(&callback_url)
        .map_err(|e| redact_sensitive(&e))?;

    let session = {
        let mut pkce = state.auth_pkce.lock().map_err(|e| e.to_string())?;
        pkce.take()
    };

    let session = session.ok_or_else(|| "No OAuth sign-in session is pending.".to_string())?;
    if session.state != returned_state {
        return Err("OAuth state mismatch in callback.".to_string());
    }

    let tokens = exchange_authorization_code(&config, &code, &session.code_verifier)
        .await
        .map_err(|e| redact_sensitive(&e))?;
    save_stored_oauth_tokens(&tokens).map_err(|e| redact_sensitive(&e))?;

    Ok(current_claude_auth_status().await)
}

/// Refresh Claude OAuth access token.
#[tauri::command]
pub async fn auth_refresh_claude_token() -> Result<ClaudeAuthStatus, String> {
    let config = load_oauth_config();
    let tokens = load_stored_oauth_tokens()
        .map_err(|e| redact_sensitive(&e))?
        .ok_or_else(|| "No stored OAuth token set found.".to_string())?;

    let refresh = tokens
        .refresh_token
        .as_deref()
        .ok_or_else(|| "No refresh token available.".to_string())?;

    let refreshed = refresh_access_token(&config, refresh)
        .await
        .map_err(|e| redact_sensitive(&e))?;
    save_stored_oauth_tokens(&refreshed).map_err(|e| redact_sensitive(&e))?;

    Ok(current_claude_auth_status().await)
}

/// Sign out Claude OAuth session and clear secure token storage.
#[tauri::command]
pub async fn auth_sign_out_claude(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = load_oauth_config();

    if let Ok(Some(tokens)) = load_stored_oauth_tokens() {
        if let (Some(revoke_url), access_token) = (config.revoke_url.as_deref(), tokens.access_token) {
            let client = reqwest::Client::new();
            let _ = client
                .post(revoke_url)
                .form(&[
                    ("token", access_token.as_str()),
                    ("client_id", config.client_id.as_str()),
                ])
                .send()
                .await;
        }
    }

    clear_stored_oauth_tokens().map_err(|e| redact_sensitive(&e))?;

    let mut session = state.auth_pkce.lock().map_err(|e| e.to_string())?;
    *session = None;
    Ok(())
}

async fn resolve_valid_access_token(
    config: &ClaudeOAuthConfig,
) -> Result<String, String> {
    let mut tokens = load_stored_oauth_tokens()?
        .ok_or_else(|| "No connected Claude account session.".to_string())?;

    if is_token_expired(tokens.expires_at_epoch_ms) {
        let refresh = tokens
            .refresh_token
            .clone()
            .ok_or_else(|| "Access token expired and no refresh token is available.".to_string())?;
        tokens = refresh_access_token(config, &refresh).await?;
        save_stored_oauth_tokens(&tokens)?;
    }

    Ok(tokens.access_token)
}

/// Invoke Claude messages via desktop OAuth token transport.
#[tauri::command]
pub async fn auth_invoke_claude_messages(
    request: ClaudeInvokeViaSubscriptionRequest,
) -> Result<String, String> {
    let config = load_oauth_config();
    if !config.enabled || config.client_id.trim().is_empty() {
        return Err("Claude OAuth transport is disabled.".to_string());
    }

    let access_token = resolve_valid_access_token(&config)
        .await
        .map_err(|e| redact_sensitive(&e))?;

    let mut body = serde_json::json!({
        "model": request.model,
        "messages": request.messages,
        "max_tokens": request.max_tokens,
        "stream": false
    });

    if let Some(system) = request.system {
        if request.system_cache_control.unwrap_or(false) {
            body["system"] = serde_json::json!([
                {
                    "type": "text",
                    "text": system,
                    "cache_control": { "type": "ephemeral" }
                }
            ]);
        } else {
            body["system"] = serde_json::json!(system);
        }
    }

    if let Some(stop_sequences) = request.stop_sequences {
        body["stop_sequences"] = serde_json::json!(stop_sequences);
    }

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", access_token))
            .map_err(|e| e.to_string())?,
    );
    headers.insert(
        "anthropic-version",
        reqwest::header::HeaderValue::from_static("2023-06-01"),
    );
    if request.system_cache_control.unwrap_or(false) {
        headers.insert(
            "anthropic-beta",
            reqwest::header::HeaderValue::from_static("prompt-caching-2024-07-31"),
        );
    }

    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/v1/messages", config.api_base_url.trim_end_matches('/')))
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude invoke failed: {}", redact_sensitive(&e.to_string())))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "Claude invoke failed with HTTP {}: {}",
            status,
            redact_sensitive(&text),
        ));
    }

    let parsed = response
        .json::<ClaudeMessagesResponse>()
        .await
        .map_err(|e| format!("Claude response parse failed: {}", redact_sensitive(&e.to_string())))?;

    let text = parsed
        .content
        .iter()
        .filter(|block| block.kind == "text")
        .filter_map(|block| block.text.as_deref())
        .collect::<String>();

    Ok(text)
}

/// Simple GPU detection heuristic.
fn detect_gpu() -> bool {
    // On Windows, check for common GPU indicators
    #[cfg(target_os = "windows")]
    {
        std::env::var("CUDA_VISIBLE_DEVICES").is_ok()
            || std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists()
    }
    #[cfg(target_os = "macos")]
    {
        true // All modern Macs have Metal GPU
    }
    #[cfg(target_os = "linux")]
    {
        std::path::Path::new("/dev/nvidia0").exists()
            || std::env::var("CUDA_VISIBLE_DEVICES").is_ok()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        false
    }
}

/// Get available system memory in MB.
fn get_available_memory_mb() -> u64 {
    // Fallback: report a reasonable default
    // Real implementation would use platform-specific APIs
    #[cfg(target_os = "windows")]
    {
        8192
    }
    #[cfg(not(target_os = "windows"))]
    {
        8192
    }
}

// ─────────────────────────── Unit Tests ──────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── §3.3: Request deserialization ──

    #[test]
    fn test_inference_request_deserialization() {
        let json = r#"{"prompt": "Hello", "max_tokens": 100}"#;
        let req: InferenceRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.prompt, "Hello");
        assert_eq!(req.max_tokens, 100);
        assert!(req.model.is_none());
        assert!(req.temperature.is_none());
        assert!(req.top_p.is_none());
    }

    #[test]
    fn test_inference_request_full_deserialization() {
        let json = r#"{
            "prompt": "Write a poem",
            "max_tokens": 256,
            "model": "llama-7b",
            "temperature": 0.8,
            "top_p": 0.95
        }"#;
        let req: InferenceRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.prompt, "Write a poem");
        assert_eq!(req.max_tokens, 256);
        assert_eq!(req.model.as_deref(), Some("llama-7b"));
        assert_eq!(req.temperature, Some(0.8));
        assert_eq!(req.top_p, Some(0.95));
    }

    // ── §3.3: Response serialization ──

    #[test]
    fn test_inference_response_serialization() {
        let resp = InferenceResponse {
            text: "World".into(),
            tokens_generated: 1,
            time_ms: 50,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("World"));
        assert!(json.contains("\"tokens_generated\":1"));
        assert!(json.contains("\"time_ms\":50"));

        // Roundtrip
        let decoded: InferenceResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, resp);
    }

    #[test]
    fn test_transcribe_request_deserialization() {
        let json = r#"{"audio_path": "/tmp/audio.wav"}"#;
        let req: TranscribeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.audio_path, "/tmp/audio.wav");
        assert!(req.language.is_none());
    }

    #[test]
    fn test_transcribe_request_with_language() {
        let json = r#"{"audio_path": "/tmp/audio.wav", "language": "es"}"#;
        let req: TranscribeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.audio_path, "/tmp/audio.wav");
        assert_eq!(req.language.as_deref(), Some("es"));
    }

    #[test]
    fn test_transcribe_response_serialization() {
        let resp = TranscribeResponse {
            text: "Hello world".into(),
            language: "en".into(),
            duration_ms: 2000,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("Hello world"));
        assert!(json.contains("\"language\":\"en\""));

        let decoded: TranscribeResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, resp);
    }

    // ── §3.3: SystemInfo serialization ──

    #[test]
    fn test_system_info_serialization() {
        let info = SystemInfo {
            platform: "windows".into(),
            has_gpu: true,
            available_memory_mb: 16384,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"platform\":\"windows\""));
        assert!(json.contains("\"has_gpu\":true"));
        assert!(json.contains("\"available_memory_mb\":16384"));

        let decoded: SystemInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, info);
    }

    // ── §3.3: BridgeError serialization ──

    #[test]
    fn test_bridge_error_serialization() {
        let err = BridgeError {
            code: "MODEL_NOT_LOADED".to_string(),
            message: "No model loaded".to_string(),
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("MODEL_NOT_LOADED"));

        let decoded: BridgeError = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, err);
    }

    // ── §3.3: Validation ──

    #[test]
    fn test_validate_inference_request_valid() {
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 100,
            model: None,
            temperature: Some(0.7),
            top_p: Some(0.9),
        };
        assert!(validate_inference_request(&req).is_ok());
    }

    #[test]
    fn test_validate_inference_request_empty_prompt() {
        let req = InferenceRequest {
            prompt: "".into(),
            max_tokens: 100,
            model: None,
            temperature: None,
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_PROMPT");
    }

    #[test]
    fn test_validate_inference_request_zero_tokens() {
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 0,
            model: None,
            temperature: None,
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_MAX_TOKENS");
    }

    #[test]
    fn test_validate_inference_request_excessive_tokens() {
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 100_000,
            model: None,
            temperature: None,
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_MAX_TOKENS");
    }

    #[test]
    fn test_validate_inference_request_invalid_temperature() {
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 100,
            model: None,
            temperature: Some(3.0),
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_TEMPERATURE");
    }

    #[test]
    fn test_validate_inference_request_invalid_top_p() {
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 100,
            model: None,
            temperature: None,
            top_p: Some(1.5),
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_TOP_P");
    }

    #[test]
    fn test_validate_transcribe_request_valid() {
        let req = TranscribeRequest {
            audio_path: "/tmp/audio.wav".into(),
            language: Some("en".into()),
        };
        assert!(validate_transcribe_request(&req).is_ok());
    }

    #[test]
    fn test_validate_transcribe_request_empty_path() {
        let req = TranscribeRequest {
            audio_path: "".into(),
            language: None,
        };
        let err = validate_transcribe_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_AUDIO_PATH");
    }

    #[test]
    fn test_validate_transcribe_request_invalid_language() {
        let req = TranscribeRequest {
            audio_path: "/tmp/audio.wav".into(),
            language: Some("x".into()), // too short
        };
        let err = validate_transcribe_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_LANGUAGE");
    }

    // ── §3.3: Serde roundtrip for all types ──

    #[test]
    fn test_full_serde_roundtrip() {
        // InferenceResponse
        let ir = InferenceResponse {
            text: "Generated text here".into(),
            tokens_generated: 42,
            time_ms: 150,
        };
        let json = serde_json::to_value(&ir).unwrap();
        let decoded: InferenceResponse = serde_json::from_value(json).unwrap();
        assert_eq!(ir, decoded);

        // TranscribeResponse
        let tr = TranscribeResponse {
            text: "Transcribed speech".into(),
            language: "fr".into(),
            duration_ms: 5000,
        };
        let json = serde_json::to_value(&tr).unwrap();
        let decoded: TranscribeResponse = serde_json::from_value(json).unwrap();
        assert_eq!(tr, decoded);

        // SystemInfo
        let si = SystemInfo {
            platform: "linux".into(),
            has_gpu: false,
            available_memory_mb: 4096,
        };
        let json = serde_json::to_value(&si).unwrap();
        let decoded: SystemInfo = serde_json::from_value(json).unwrap();
        assert_eq!(si, decoded);
    }

    // ── §6.4: Error code mapping ──

    #[test]
    fn test_error_code_from_inference_error() {
        assert_eq!(
            error_code_from_inference_error(&InferenceError::ModelNotLoaded),
            "MODEL_NOT_LOADED"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::ModelNotFound("x".into())),
            "MODEL_NOT_FOUND"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::InferenceFailed("x".into())),
            "INFERENCE_FAILED"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::InvalidFormat("x".into())),
            "INVALID_FORMAT"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::ModelBusy),
            "MODEL_BUSY"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::Cancelled),
            "CANCELLED"
        );
        assert_eq!(
            error_code_from_inference_error(&InferenceError::InvalidAudio("x".into())),
            "INVALID_AUDIO"
        );
    }

    // ── §6.4: LoadModelRequest/Response serialization ──

    #[test]
    fn test_load_model_request_deserialization() {
        let json = r#"{"path": "/models/llama.gguf"}"#;
        let req: LoadModelRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.path, "/models/llama.gguf");
    }

    #[test]
    fn test_load_model_response_serialization() {
        let resp = LoadModelResponse {
            name: "llama-8b".into(),
            size_bytes: 4_700_000_000,
            context_length: Some(8192),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"name\":\"llama-8b\""));

        let decoded: LoadModelResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, resp);
    }

    // ── §6.4: StreamTokenEvent serialization ──

    #[test]
    fn test_stream_token_event_serialization() {
        let event = StreamTokenEvent {
            token: "Hello".into(),
            done: false,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"token\":\"Hello\""));
        assert!(json.contains("\"done\":false"));

        let done_event = StreamTokenEvent {
            token: String::new(),
            done: true,
        };
        let json = serde_json::to_string(&done_event).unwrap();
        assert!(json.contains("\"done\":true"));
    }

    // ── TranscribeAudioBytesRequest deserialization ──

    #[test]
    fn test_transcribe_audio_bytes_request_deserialization() {
        let json = r#"{"samples": [0.1, 0.2, 0.3]}"#;
        let req: TranscribeAudioBytesRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.samples.len(), 3);
        assert!((req.samples[0] - 0.1).abs() < 0.001);
        assert!(req.language.is_none());
    }

    #[test]
    fn test_transcribe_audio_bytes_request_with_language() {
        let json = r#"{"samples": [0.5], "language": "en"}"#;
        let req: TranscribeAudioBytesRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.samples.len(), 1);
        assert_eq!(req.language.as_deref(), Some("en"));
    }

    #[test]
    fn test_validate_transcribe_audio_bytes_request_valid() {
        let req = TranscribeAudioBytesRequest {
            samples: vec![0.1, 0.2],
            language: Some("en".into()),
        };
        assert!(validate_transcribe_audio_bytes_request(&req).is_ok());
    }

    #[test]
    fn test_validate_transcribe_audio_bytes_request_empty_samples() {
        let req = TranscribeAudioBytesRequest {
            samples: vec![],
            language: None,
        };
        let err = validate_transcribe_audio_bytes_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_AUDIO");
    }

    #[test]
    fn test_validate_transcribe_audio_bytes_request_invalid_language() {
        let req = TranscribeAudioBytesRequest {
            samples: vec![0.1],
            language: Some("x".into()),
        };
        let err = validate_transcribe_audio_bytes_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_LANGUAGE");
    }

    #[test]
    fn test_sanitize_model_filename_rejects_path_traversal() {
        assert!(sanitize_model_filename("../evil.gguf").is_err());
        assert!(sanitize_model_filename("..\\evil.gguf").is_err());
        assert!(sanitize_model_filename("nested/evil.gguf").is_err());
    }

    #[test]
    fn test_sanitize_model_filename_accepts_basename() {
        let safe = sanitize_model_filename("llama-3-8b.gguf").unwrap();
        assert_eq!(safe, "llama-3-8b.gguf");
    }

    #[test]
    fn test_decode_f32_le_audio_rejects_misaligned_bytes() {
        let err = decode_f32_le_audio(&[1_u8, 2, 3]).unwrap_err();
        match err {
            InferenceError::InvalidAudio(msg) => {
                assert!(msg.contains("divisible by 4"));
            }
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }
    }

    // ── §10.1: FileFilter deserialization ──

    #[test]
    fn test_file_filter_deserialization() {
        let json = r#"{"name": "Inkwell Document", "extensions": ["inkwell"]}"#;
        let f: FileFilter = serde_json::from_str(json).unwrap();
        assert_eq!(f.name, "Inkwell Document");
        assert_eq!(f.extensions, vec!["inkwell"]);
    }

    #[test]
    fn test_file_filter_multiple_extensions() {
        let json = r#"{"name": "Images", "extensions": ["png", "jpg", "gif"]}"#;
        let f: FileFilter = serde_json::from_str(json).unwrap();
        assert_eq!(f.extensions.len(), 3);
    }

    // ── §10.2: ModelInfo serialization ──

    #[test]
    fn test_model_info_serialization() {
        let info = ModelInfo {
            name: "llama-3-8b".into(),
            filename: "llama-3-8b-q4.gguf".into(),
            size_bytes: 4_500_000_000,
            model_type: "llm".into(),
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"name\":\"llama-3-8b\""));
        assert!(json.contains("\"model_type\":\"llm\""));

        let decoded: ModelInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, info);
    }

    #[test]
    fn test_models_status_serialization() {
        let status = ModelsStatus {
            models_dir: "/home/user/.local/share/inkwell/models".into(),
            llm_models: vec![ModelInfo {
                name: "test-llm".into(),
                filename: "test.gguf".into(),
                size_bytes: 100,
                model_type: "llm".into(),
            }],
            whisper_models: vec![],
            has_llm: true,
            has_whisper: false,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("\"has_llm\":true"));
        assert!(json.contains("\"has_whisper\":false"));

        let decoded: ModelsStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(decoded, status);
    }

    #[test]
    fn test_download_progress_event_serialization() {
        let event = DownloadProgressEvent {
            model_name: "llama-3-8b".into(),
            bytes_downloaded: 1_000_000,
            total_bytes: Some(4_000_000),
            progress_pct: Some(25.0),
            done: false,
            error: None,
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"progress_pct\":25.0"));
        assert!(json.contains("\"done\":false"));

        let done_event = DownloadProgressEvent {
            model_name: "llama-3-8b".into(),
            bytes_downloaded: 4_000_000,
            total_bytes: Some(4_000_000),
            progress_pct: Some(100.0),
            done: true,
            error: None,
        };
        let json = serde_json::to_string(&done_event).unwrap();
        assert!(json.contains("\"done\":true"));
    }

    #[test]
    fn test_download_progress_event_with_error() {
        let event = DownloadProgressEvent {
            model_name: "llama-3-8b".into(),
            bytes_downloaded: 500,
            total_bytes: Some(1000),
            progress_pct: Some(50.0),
            done: true,
            error: Some("Network error".into()),
        };
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"error\":\"Network error\""));
    }
}
