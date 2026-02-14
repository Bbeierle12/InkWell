//! §3.3 Bridge throughput integration tests.
//!
//! Serialize/deserialize roundtrips, error propagation, and concurrent access.

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::thread;

    use crate::bridge::commands::{
        BridgeError, InferenceRequest, InferenceResponse, SystemInfo,
        TranscribeRequest, TranscribeResponse,
        validate_inference_request, validate_transcribe_request,
    };

    /// §3.3 — Full serialize/deserialize cycle for all bridge types
    #[test]
    fn test_bridge_request_roundtrip() {
        // InferenceRequest → JSON → InferenceRequest fields
        let json = r#"{
            "prompt": "The quick brown fox",
            "max_tokens": 200,
            "model": "llama-7b",
            "temperature": 0.5,
            "top_p": 0.85
        }"#;
        let req: InferenceRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.prompt, "The quick brown fox");
        assert_eq!(req.max_tokens, 200);
        assert_eq!(req.model.as_deref(), Some("llama-7b"));
        assert_eq!(req.temperature, Some(0.5));
        assert_eq!(req.top_p, Some(0.85));

        // InferenceResponse roundtrip
        let resp = InferenceResponse {
            text: "jumps over the lazy dog".into(),
            tokens_generated: 7,
            time_ms: 120,
        };
        let serialized = serde_json::to_string(&resp).unwrap();
        let deserialized: InferenceResponse = serde_json::from_str(&serialized).unwrap();
        assert_eq!(resp, deserialized);

        // TranscribeRequest → JSON → TranscribeRequest fields
        let json = r#"{"audio_path": "/audio/input.wav", "language": "de"}"#;
        let treq: TranscribeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(treq.audio_path, "/audio/input.wav");
        assert_eq!(treq.language.as_deref(), Some("de"));

        // TranscribeResponse roundtrip
        let tresp = TranscribeResponse {
            text: "Hallo Welt".into(),
            language: "de".into(),
            duration_ms: 3500,
        };
        let serialized = serde_json::to_string(&tresp).unwrap();
        let deserialized: TranscribeResponse = serde_json::from_str(&serialized).unwrap();
        assert_eq!(tresp, deserialized);

        // SystemInfo roundtrip
        let info = SystemInfo {
            platform: "linux".into(),
            has_gpu: true,
            available_memory_mb: 32768,
        };
        let serialized = serde_json::to_string(&info).unwrap();
        let deserialized: SystemInfo = serde_json::from_str(&serialized).unwrap();
        assert_eq!(info, deserialized);

        // BridgeError roundtrip
        let err = BridgeError {
            code: "TEST_ERROR".into(),
            message: "Something went wrong".into(),
        };
        let serialized = serde_json::to_string(&err).unwrap();
        let deserialized: BridgeError = serde_json::from_str(&serialized).unwrap();
        assert_eq!(err, deserialized);
    }

    /// §3.3 — Validation errors serialize to JSON for JS consumption
    #[test]
    fn test_bridge_error_propagation() {
        // Empty prompt → BridgeError with code
        let req = InferenceRequest {
            prompt: "".into(),
            max_tokens: 100,
            model: None,
            temperature: None,
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        assert_eq!(err.code, "INVALID_PROMPT");

        // Serialize error to JSON (as bridge would)
        let json = serde_json::to_string(&err).unwrap();
        let parsed: BridgeError = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, "INVALID_PROMPT");
        assert!(!parsed.message.is_empty());

        // Max tokens exceeded
        let req = InferenceRequest {
            prompt: "Hello".into(),
            max_tokens: 50_000,
            model: None,
            temperature: None,
            top_p: None,
        };
        let err = validate_inference_request(&req).unwrap_err();
        let json = serde_json::to_string(&err).unwrap();
        let parsed: BridgeError = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, "INVALID_MAX_TOKENS");

        // TranscribeRequest validation
        let req = TranscribeRequest {
            audio_path: "".into(),
            language: None,
        };
        let err = validate_transcribe_request(&req).unwrap_err();
        let json = serde_json::to_string(&err).unwrap();
        let parsed: BridgeError = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, "INVALID_AUDIO_PATH");
    }

    /// §3.3 — Multiple concurrent serialize/validate operations
    #[test]
    fn test_bridge_concurrent_commands() {
        let test_data: Vec<(String, usize)> = (0..16)
            .map(|i| (format!("Prompt number {}", i), (i + 1) * 10))
            .collect();
        let test_data = Arc::new(test_data);

        let mut handles = vec![];

        for i in 0..16 {
            let data = Arc::clone(&test_data);
            handles.push(thread::spawn(move || {
                let (prompt, max_tokens) = &data[i];

                // Serialize request
                let req = InferenceRequest {
                    prompt: prompt.clone(),
                    max_tokens: *max_tokens,
                    model: None,
                    temperature: Some(0.7),
                    top_p: None,
                };

                // Validate
                let valid = validate_inference_request(&req);
                assert!(valid.is_ok(), "Thread {} validation failed", i);

                // Serialize response
                let resp = InferenceResponse {
                    text: format!("Response to {}", prompt),
                    tokens_generated: max_tokens / 2,
                    time_ms: 100,
                };
                let json = serde_json::to_string(&resp).unwrap();
                let decoded: InferenceResponse = serde_json::from_str(&json).unwrap();
                assert_eq!(resp, decoded);
            }));
        }

        for h in handles {
            h.join().expect("Thread panicked in concurrent test");
        }
    }

    /// §3.3 — Validation boundary cases
    #[test]
    fn test_validation_boundary_cases() {
        // max_tokens = 1 (minimum valid)
        let req = InferenceRequest {
            prompt: "x".into(),
            max_tokens: 1,
            model: None,
            temperature: None,
            top_p: None,
        };
        assert!(validate_inference_request(&req).is_ok());

        // max_tokens = 16384 (maximum valid)
        let req = InferenceRequest {
            prompt: "x".into(),
            max_tokens: 16384,
            model: None,
            temperature: None,
            top_p: None,
        };
        assert!(validate_inference_request(&req).is_ok());

        // max_tokens = 16385 (just over max)
        let req = InferenceRequest {
            prompt: "x".into(),
            max_tokens: 16385,
            model: None,
            temperature: None,
            top_p: None,
        };
        assert!(validate_inference_request(&req).is_err());

        // temperature = 0.0 (minimum valid)
        let req = InferenceRequest {
            prompt: "x".into(),
            max_tokens: 10,
            model: None,
            temperature: Some(0.0),
            top_p: None,
        };
        assert!(validate_inference_request(&req).is_ok());

        // temperature = 2.0 (maximum valid)
        let req = InferenceRequest {
            prompt: "x".into(),
            max_tokens: 10,
            model: None,
            temperature: Some(2.0),
            top_p: None,
        };
        assert!(validate_inference_request(&req).is_ok());

        // language = "en" (minimum valid length)
        let req = TranscribeRequest {
            audio_path: "/audio.wav".into(),
            language: Some("en".into()),
        };
        assert!(validate_transcribe_request(&req).is_ok());

        // language = "zh-CN" (maximum valid length for common codes)
        let req = TranscribeRequest {
            audio_path: "/audio.wav".into(),
            language: Some("zh-CN".into()),
        };
        assert!(validate_transcribe_request(&req).is_ok());
    }
}
