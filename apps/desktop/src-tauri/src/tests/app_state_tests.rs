//! §6.4 AppState integration tests.
//!
//! Tests that AppState correctly wires mock engines and that bridge
//! commands can access engines through the state.

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::sync::{Arc, Mutex};

    use crate::AppState;
    use crate::inference::llama::LlamaEngine;
    use crate::inference::whisper::WhisperEngine;
    use crate::inference::{GenerationParams, InferenceError, StubLlmBackend, StubSttBackend};

    #[cfg(test)]
    use crate::inference::llama::mock::MockLlmBackend;
    #[cfg(test)]
    use crate::inference::whisper::mock::MockSttBackend;

    fn temp_gguf_file() -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".gguf")
            .tempfile()
            .expect("Failed to create temp gguf file");
        f.write_all(b"GGUF_FAKE_HEADER").unwrap();
        f
    }

    fn temp_bin_file() -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".bin")
            .tempfile()
            .expect("Failed to create temp bin file");
        f.write_all(b"WHISPER_FAKE").unwrap();
        f
    }

    fn fake_audio_secs(secs: f64) -> Vec<f32> {
        let sample_rate = 16000usize;
        let samples = (sample_rate as f64 * secs) as usize;
        (0..samples)
            .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / sample_rate as f32).sin() * 0.5)
            .collect()
    }

    /// §6.4 — AppState with mock backends works for LLM operations
    #[test]
    fn test_app_state_llm_with_mock() {
        let state = AppState {
            llm: Arc::new(LlamaEngine::new(Box::new(MockLlmBackend::new()))),
            stt: Arc::new(WhisperEngine::new(Box::new(MockSttBackend::new()))),
            pending_file: Arc::new(Mutex::new(None)),
            auth_pkce: Arc::new(Mutex::new(None)),
        };

        let f = temp_gguf_file();
        let meta = state.llm.load_model(f.path().to_str().unwrap()).unwrap();
        assert_eq!(meta.name, "mock-model-7b");
        assert!(state.llm.is_loaded());

        let params = GenerationParams {
            max_tokens: 100,
            ..Default::default()
        };
        let result = state.llm.generate("Hello", &params).unwrap();
        assert_eq!(result.text, "Hello, world!");

        state.llm.unload().unwrap();
        assert!(!state.llm.is_loaded());
    }

    /// §6.4 — AppState with mock backends works for STT operations
    #[test]
    fn test_app_state_stt_with_mock() {
        let state = AppState {
            llm: Arc::new(LlamaEngine::new(Box::new(MockLlmBackend::new()))),
            stt: Arc::new(WhisperEngine::new(Box::new(MockSttBackend::new()))),
            pending_file: Arc::new(Mutex::new(None)),
            auth_pkce: Arc::new(Mutex::new(None)),
        };

        let f = temp_bin_file();
        let meta = state.stt.load_model(f.path().to_str().unwrap()).unwrap();
        assert_eq!(meta.name, "whisper-base");

        let audio = fake_audio_secs(1.0);
        let result = state.stt.transcribe(&audio, None).unwrap();
        assert_eq!(result.text, "Hello world.");

        state.stt.unload().unwrap();
    }

    /// §6.4 — AppState with stub backends returns appropriate errors
    #[test]
    fn test_app_state_stub_backends() {
        let state = AppState {
            llm: Arc::new(LlamaEngine::new(Box::new(StubLlmBackend))),
            stt: Arc::new(WhisperEngine::new(Box::new(StubSttBackend))),
            pending_file: Arc::new(Mutex::new(None)),
            auth_pkce: Arc::new(Mutex::new(None)),
        };

        // Stub LLM: load returns error about feature flag
        let f = temp_gguf_file();
        let err = state.llm.load_model(f.path().to_str().unwrap()).unwrap_err();
        match err {
            InferenceError::InferenceFailed(msg) => {
                assert!(msg.contains("local-inference"), "Error should mention feature flag: {}", msg);
            }
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }

        // Stub STT: load returns error about feature flag
        let f = temp_bin_file();
        let err = state.stt.load_model(f.path().to_str().unwrap()).unwrap_err();
        match err {
            InferenceError::InferenceFailed(msg) => {
                assert!(msg.contains("local-inference"), "Error should mention feature flag: {}", msg);
            }
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
    }

    /// §6.4 — Concurrent access to AppState from multiple threads
    #[test]
    fn test_app_state_concurrent_access() {
        let state = Arc::new(AppState {
            llm: Arc::new(LlamaEngine::new(Box::new(MockLlmBackend::new()))),
            stt: Arc::new(WhisperEngine::new(Box::new(MockSttBackend::new()))),
            pending_file: Arc::new(Mutex::new(None)),
            auth_pkce: Arc::new(Mutex::new(None)),
        });

        let f = temp_gguf_file();
        state.llm.load_model(f.path().to_str().unwrap()).unwrap();

        let f = temp_bin_file();
        state.stt.load_model(f.path().to_str().unwrap()).unwrap();

        let mut handles = vec![];
        for i in 0..8 {
            let s = Arc::clone(&state);
            handles.push(std::thread::spawn(move || {
                if i % 2 == 0 {
                    // LLM generate
                    let params = GenerationParams {
                        max_tokens: 50,
                        ..Default::default()
                    };
                    let result = s.llm.generate(&format!("Thread {}", i), &params);
                    assert!(result.is_ok(), "Thread {} LLM failed: {:?}", i, result);
                } else {
                    // STT transcribe
                    let audio = fake_audio_secs(0.5);
                    let result = s.stt.transcribe(&audio, None);
                    assert!(result.is_ok(), "Thread {} STT failed: {:?}", i, result);
                }
            }));
        }

        for h in handles {
            h.join().expect("Thread panicked");
        }
    }

    /// §6.4 — Large payload transfer integrity
    #[test]
    fn test_large_payload_integrity() {
        let state = AppState {
            llm: Arc::new(LlamaEngine::new(Box::new(MockLlmBackend::new()))),
            stt: Arc::new(WhisperEngine::new(Box::new(MockSttBackend::new()))),
            pending_file: Arc::new(Mutex::new(None)),
            auth_pkce: Arc::new(Mutex::new(None)),
        };

        let f = temp_gguf_file();
        state.llm.load_model(f.path().to_str().unwrap()).unwrap();

        // Generate with a large prompt
        let large_prompt = "x".repeat(10_000);
        let params = GenerationParams {
            max_tokens: 256,
            ..Default::default()
        };
        let result = state.llm.generate(&large_prompt, &params).unwrap();
        assert!(!result.text.is_empty());

        // Transcribe a large audio buffer (30 seconds)
        let f = temp_bin_file();
        state.stt.load_model(f.path().to_str().unwrap()).unwrap();

        let large_audio = fake_audio_secs(30.0);
        assert_eq!(large_audio.len(), 480_000); // 30s * 16000
        let result = state.stt.transcribe(&large_audio, None).unwrap();
        assert!(!result.text.is_empty());
    }

    /// §6.4 — Error code mapping helper
    #[test]
    fn test_bridge_error_code_mapping() {
        use crate::bridge::commands::error_code_from_inference_error;

        let mappings = vec![
            (InferenceError::ModelNotLoaded, "MODEL_NOT_LOADED"),
            (InferenceError::ModelNotFound("x".into()), "MODEL_NOT_FOUND"),
            (InferenceError::InferenceFailed("x".into()), "INFERENCE_FAILED"),
            (InferenceError::InvalidFormat("x".into()), "INVALID_FORMAT"),
            (InferenceError::ModelBusy, "MODEL_BUSY"),
            (InferenceError::Cancelled, "CANCELLED"),
            (InferenceError::InvalidAudio("x".into()), "INVALID_AUDIO"),
        ];

        for (err, expected_code) in mappings {
            assert_eq!(
                error_code_from_inference_error(&err),
                expected_code,
                "Mismatch for {:?}",
                err
            );
        }
    }
}
