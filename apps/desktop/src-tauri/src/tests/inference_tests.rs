//! §3.1 Local inference integration tests.
//!
//! These tests verify the LlamaEngine lifecycle, concurrent access,
//! and token limit enforcement using the mock backend.

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::sync::Arc;

    use crate::inference::llama::LlamaEngine;
    use crate::inference::{GenerationParams, InferenceError};

    #[cfg(test)]
    use crate::inference::llama::mock::MockLlmBackend;

    fn temp_gguf_file() -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".gguf")
            .tempfile()
            .expect("Failed to create temp gguf file");
        f.write_all(b"GGUF_FAKE_HEADER").unwrap();
        f
    }

    /// §3.1 — Full lifecycle: create → load → generate → unload
    #[test]
    fn test_llama_engine_lifecycle() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));

        // Initially unloaded
        assert!(!engine.is_loaded());

        // Load
        let meta = engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());
        assert_eq!(meta.name, "mock-model-7b");
        assert_eq!(meta.context_length, Some(4096));

        // Generate
        let params = GenerationParams {
            max_tokens: 100,
            ..Default::default()
        };
        let result = engine.generate("Hello", &params).unwrap();
        assert!(!result.text.is_empty());
        assert!(result.tokens_generated > 0);

        // Unload
        engine.unload().unwrap();
        assert!(!engine.is_loaded());

        // Generate after unload fails
        let err = engine.generate("Hello", &params).unwrap_err();
        assert_eq!(err, InferenceError::ModelNotLoaded);
    }

    /// §3.1 — Concurrent generation from multiple threads
    #[test]
    fn test_llama_concurrent_requests() {
        let f = temp_gguf_file();
        let path = f.path().to_str().unwrap().to_string();
        let backend = MockLlmBackend::new();
        let engine = Arc::new(LlamaEngine::new(Box::new(backend)));
        engine.load_model(&path).unwrap();

        let mut handles = vec![];
        for i in 0..8 {
            let e = Arc::clone(&engine);
            handles.push(std::thread::spawn(move || {
                let params = GenerationParams {
                    max_tokens: 50,
                    ..Default::default()
                };
                let prompt = format!("Thread {} says:", i);
                let result = e.generate(&prompt, &params);
                // All should succeed (mock backend is thread-safe)
                assert!(result.is_ok(), "Thread {} failed: {:?}", i, result);
            }));
        }

        for h in handles {
            h.join().expect("Thread panicked");
        }
    }

    /// §3.1 — max_tokens is respected (tokens_generated <= max_tokens)
    #[test]
    fn test_llama_token_limit_respected() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        for max in [1, 5, 10, 50, 256] {
            let params = GenerationParams {
                max_tokens: max,
                ..Default::default()
            };
            let result = engine.generate("Prompt", &params).unwrap();
            assert!(
                result.tokens_generated <= max,
                "Generated {} tokens but max was {}",
                result.tokens_generated,
                max
            );
        }
    }
}
