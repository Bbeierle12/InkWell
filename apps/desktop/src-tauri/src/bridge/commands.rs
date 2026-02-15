//! Tauri invoke commands (Rust <-> JS bridge).
//!
//! These commands are exposed to the JS frontend via `tauri::command`.
//! They handle serialization, validation, and delegation to the inference engines.

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::AppState;
use crate::inference::{GenerationParams, InferenceError};

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

    let result = state.llm.generate(&request.prompt, &params).map_err(bridge_err)?;

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
    let audio_bytes = std::fs::read(&request.audio_path).map_err(|e| {
        bridge_err(InferenceError::InvalidAudio(format!(
            "Failed to read audio file: {}", e
        )))
    })?;

    // Convert bytes to f32 samples
    let audio: Vec<f32> = audio_bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    let lang_hint = request.language.as_deref();
    let result = state.stt.transcribe(&audio, lang_hint).map_err(bridge_err)?;

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

    let audio_bytes = std::fs::read(&request.audio_path).map_err(|e| {
        bridge_err(InferenceError::InvalidAudio(format!(
            "Failed to read audio file: {}", e
        )))
    })?;

    let audio: Vec<f32> = audio_bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    let lang_hint = request.language.as_deref();
    let app_handle = app.clone();

    let result = state.stt.transcribe_streaming(
        &audio,
        lang_hint,
        &mut |partial| {
            let _ = app_handle.emit("whisper-partial", partial.to_string());
        },
    ).map_err(bridge_err)?;

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

    let lang_hint = request.language.as_deref();
    let result = state.stt.transcribe(&request.samples, lang_hint).map_err(bridge_err)?;

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
                } else if filename.ends_with(".bin") && filename.contains("whisper") {
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

    let dest = models_dir.join(&filename);
    let model_name = filename.clone();

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
