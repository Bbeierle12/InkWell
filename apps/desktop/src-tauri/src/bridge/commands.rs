//! Tauri invoke commands (Rust <-> JS bridge).
//!
//! These commands are exposed to the JS frontend via `tauri::command`.
//! They handle serialization, validation, and delegation to the inference engines.

use serde::{Deserialize, Serialize};

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
    request: InferenceRequest,
) -> Result<InferenceResponse, String> {
    validate_inference_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    // TODO: delegate to LlamaEngine when integrated with app state
    // For now, return a structured error indicating model not loaded
    Err(serde_json::to_string(&BridgeError {
        code: "MODEL_NOT_LOADED".to_string(),
        message: "No model is currently loaded. Use load_model first.".to_string(),
    })
    .unwrap())
}

/// Invoke audio transcription from the JS frontend.
#[tauri::command]
pub async fn transcribe_audio(
    request: TranscribeRequest,
) -> Result<TranscribeResponse, String> {
    validate_transcribe_request(&request).map_err(|e| {
        serde_json::to_string(&e).unwrap_or_else(|_| e.to_string())
    })?;

    // TODO: delegate to WhisperEngine when integrated with app state
    Err(serde_json::to_string(&BridgeError {
        code: "MODEL_NOT_LOADED".to_string(),
        message: "No whisper model is currently loaded.".to_string(),
    })
    .unwrap())
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
        // Try reading from sysinfo, fallback to 8GB default
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
}
