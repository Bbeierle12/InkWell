//! llama.cpp bindings for local text generation.
//!
//! `LlamaEngine` wraps an `LlmBackend` trait object, managing model lifecycle
//! and enforcing thread-safe access via `Mutex`. The real FFI backend
//! (`llama-cpp-2` crate) is behind a feature flag; tests use `MockLlmBackend`.

use std::path::Path;
use std::sync::{Arc, Mutex};

use super::{
    GenerationParams, GenerationResult, InferenceError, LlmBackend, ModelMetadata,
};

/// Model state tracked by the engine.
#[derive(Debug, Clone, PartialEq)]
enum ModelState {
    Unloaded,
    Loaded(String), // path
}

/// Local text generation engine.
///
/// Thread-safe: all access to the backend goes through `Mutex<Inner>`.
pub struct LlamaEngine {
    inner: Arc<Mutex<LlamaInner>>,
}

struct LlamaInner {
    backend: Box<dyn LlmBackend>,
    state: ModelState,
    metadata: Option<ModelMetadata>,
}

impl LlamaEngine {
    /// Create a new engine with the given backend.
    pub fn new(backend: Box<dyn LlmBackend>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(LlamaInner {
                backend,
                state: ModelState::Unloaded,
                metadata: None,
            })),
        }
    }

    /// Load a GGUF model from the given path.
    ///
    /// Validates that the path exists and has a `.gguf` extension before
    /// delegating to the backend.
    pub fn load_model(&self, path: &str) -> Result<ModelMetadata, InferenceError> {
        let p = Path::new(path);

        // Validate file exists
        if !p.exists() {
            return Err(InferenceError::ModelNotFound(path.to_string()));
        }

        // Validate extension
        match p.extension().and_then(|e| e.to_str()) {
            Some("gguf") => {}
            _ => {
                return Err(InferenceError::InvalidFormat(
                    "Expected .gguf model file".to_string(),
                ));
            }
        }

        let mut inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        // Unload previous model if loaded
        if inner.state != ModelState::Unloaded {
            let _ = inner.backend.unload();
        }

        let metadata = inner.backend.load(path)?;
        inner.state = ModelState::Loaded(path.to_string());
        inner.metadata = Some(metadata.clone());
        Ok(metadata)
    }

    /// Generate text from the given prompt using the loaded model.
    pub fn generate(
        &self,
        prompt: &str,
        params: &GenerationParams,
    ) -> Result<GenerationResult, InferenceError> {
        let inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state == ModelState::Unloaded {
            return Err(InferenceError::ModelNotLoaded);
        }

        if prompt.is_empty() {
            return Err(InferenceError::InferenceFailed(
                "Prompt cannot be empty".to_string(),
            ));
        }

        if params.max_tokens == 0 {
            return Err(InferenceError::InferenceFailed(
                "max_tokens must be > 0".to_string(),
            ));
        }

        inner.backend.generate(prompt, params)
    }

    /// Check if a model is currently loaded.
    pub fn is_loaded(&self) -> bool {
        self.inner
            .lock()
            .map(|inner| inner.state != ModelState::Unloaded)
            .unwrap_or(false)
    }

    /// Get metadata about the currently loaded model.
    pub fn metadata(&self) -> Option<ModelMetadata> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.metadata.clone())
    }

    /// Unload the current model and free resources.
    pub fn unload(&self) -> Result<(), InferenceError> {
        let mut inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state == ModelState::Unloaded {
            return Ok(()); // Already unloaded, idempotent
        }

        inner.backend.unload()?;
        inner.state = ModelState::Unloaded;
        inner.metadata = None;
        Ok(())
    }

}

// ───────────────────────── Mock Backend (test-only) ─────────────────────────

#[cfg(test)]
pub mod mock {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    /// A controllable mock backend for testing LlamaEngine behavior.
    pub struct MockLlmBackend {
        /// If set, `load()` returns this error.
        pub load_error: Mutex<Option<InferenceError>>,
        /// If set, `generate()` returns this error.
        pub generate_error: Mutex<Option<InferenceError>>,
        /// Text that `generate()` returns on success.
        pub generate_text: Mutex<String>,
        /// Tracks whether the model is currently loaded.
        pub is_loaded: AtomicBool,
        /// Counts how many times `generate()` was called.
        pub generate_call_count: AtomicUsize,
        /// Counts how many times `load()` was called.
        pub load_call_count: AtomicUsize,
        /// Counts how many times `unload()` was called.
        pub unload_call_count: AtomicUsize,
        /// Simulated generation delay in ms (for concurrency tests).
        pub generate_delay_ms: AtomicUsize,
    }

    impl MockLlmBackend {
        pub fn new() -> Self {
            Self {
                load_error: Mutex::new(None),
                generate_error: Mutex::new(None),
                generate_text: Mutex::new("Hello, world!".to_string()),
                is_loaded: AtomicBool::new(false),
                generate_call_count: AtomicUsize::new(0),
                load_call_count: AtomicUsize::new(0),
                unload_call_count: AtomicUsize::new(0),
                generate_delay_ms: AtomicUsize::new(0),
            }
        }
    }

    impl LlmBackend for MockLlmBackend {
        fn load(&self, _path: &str) -> Result<ModelMetadata, InferenceError> {
            self.load_call_count.fetch_add(1, Ordering::SeqCst);
            if let Some(err) = self.load_error.lock().unwrap().take() {
                return Err(err);
            }
            self.is_loaded.store(true, Ordering::SeqCst);
            Ok(ModelMetadata {
                name: "mock-model-7b".to_string(),
                size_bytes: 4_000_000_000,
                context_length: Some(4096),
            })
        }

        fn generate(
            &self,
            _prompt: &str,
            params: &GenerationParams,
        ) -> Result<GenerationResult, InferenceError> {
            self.generate_call_count.fetch_add(1, Ordering::SeqCst);

            let delay = self.generate_delay_ms.load(Ordering::SeqCst);
            if delay > 0 {
                std::thread::sleep(std::time::Duration::from_millis(delay as u64));
            }

            if let Some(err) = self.generate_error.lock().unwrap().take() {
                return Err(err);
            }

            let text = self.generate_text.lock().unwrap().clone();
            // Simulate token count: ~1 token per 4 chars, capped at max_tokens
            let token_count = (text.len() / 4).max(1).min(params.max_tokens);

            Ok(GenerationResult {
                text,
                tokens_generated: token_count,
                time_to_first_token_ms: 15,
                total_time_ms: 50,
            })
        }

        fn unload(&self) -> Result<(), InferenceError> {
            self.unload_call_count.fetch_add(1, Ordering::SeqCst);
            self.is_loaded.store(false, Ordering::SeqCst);
            Ok(())
        }
    }
}

// ───────────────────────────── Unit Tests ────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use mock::MockLlmBackend;
    use std::io::Write;
    use tempfile::NamedTempFile;

    /// Helper: create a temporary .gguf file for testing path validation.
    fn temp_gguf_file() -> NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".gguf")
            .tempfile()
            .expect("Failed to create temp gguf file");
        // Write some bytes so the file is non-empty
        f.write_all(b"GGUF_FAKE_HEADER").unwrap();
        f
    }

    /// Helper: create a temp file with wrong extension.
    fn temp_wrong_ext_file() -> NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".bin")
            .tempfile()
            .expect("Failed to create temp bin file");
        f.write_all(b"NOT_GGUF").unwrap();
        f
    }

    // ── §3.1: Engine creation ──

    #[test]
    fn test_engine_creation() {
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        assert!(!engine.is_loaded());
        assert!(engine.metadata().is_none());
    }

    // ── §3.1: Generate without model → error ──

    #[test]
    fn test_generate_without_model_returns_error() {
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        let params = GenerationParams::default();
        let result = engine.generate("Hello", &params);
        assert_eq!(result.unwrap_err(), InferenceError::ModelNotLoaded);
    }

    // ── §3.1: Load nonexistent model → ModelNotFound ──

    #[test]
    fn test_load_nonexistent_model() {
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        let result = engine.load_model("/nonexistent/model.gguf");
        assert_eq!(
            result.unwrap_err(),
            InferenceError::ModelNotFound("/nonexistent/model.gguf".to_string())
        );
    }

    // ── §3.1: Load model with wrong extension → InvalidFormat ──

    #[test]
    fn test_load_wrong_extension() {
        let f = temp_wrong_ext_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        let result = engine.load_model(f.path().to_str().unwrap());
        match result.unwrap_err() {
            InferenceError::InvalidFormat(msg) => {
                assert!(msg.contains(".gguf"));
            }
            other => panic!("Expected InvalidFormat, got {:?}", other),
        }
    }

    // ── §3.1: Successful model load ──

    #[test]
    fn test_load_valid_model() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        let metadata = engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert_eq!(metadata.name, "mock-model-7b");
        assert!(engine.is_loaded());
        assert!(engine.metadata().is_some());
    }

    // ── §3.1: Successful generation ──

    #[test]
    fn test_generate_success() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let params = GenerationParams {
            max_tokens: 100,
            ..Default::default()
        };
        let result = engine.generate("Continue this sentence:", &params).unwrap();
        assert_eq!(result.text, "Hello, world!");
        assert!(result.tokens_generated > 0);
        assert!(result.tokens_generated <= 100);
        assert!(result.total_time_ms > 0);
    }

    // ── §3.1: max_tokens enforcement ──

    #[test]
    fn test_max_tokens_zero_rejected() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let params = GenerationParams {
            max_tokens: 0,
            ..Default::default()
        };
        let result = engine.generate("Hello", &params);
        match result.unwrap_err() {
            InferenceError::InferenceFailed(msg) => assert!(msg.contains("max_tokens")),
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
    }

    // ── §3.1: Empty prompt rejected ──

    #[test]
    fn test_empty_prompt_rejected() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let params = GenerationParams::default();
        let result = engine.generate("", &params);
        match result.unwrap_err() {
            InferenceError::InferenceFailed(msg) => assert!(msg.contains("empty")),
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
    }

    // ── §3.1: Unload ──

    #[test]
    fn test_unload_lifecycle() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));

        // Unload when already unloaded is a no-op
        engine.unload().unwrap();
        assert!(!engine.is_loaded());

        // Load then unload
        engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());

        engine.unload().unwrap();
        assert!(!engine.is_loaded());
        assert!(engine.metadata().is_none());

        // Generate after unload fails
        let result = engine.generate("test", &GenerationParams::default());
        assert_eq!(result.unwrap_err(), InferenceError::ModelNotLoaded);
    }

    // ── §3.1: Reload replaces previous model ──

    #[test]
    fn test_reload_replaces_model() {
        let f1 = temp_gguf_file();
        let f2 = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));

        engine.load_model(f1.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());

        // Loading a second model should unload the first
        engine.load_model(f2.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());
    }

    // ── §3.1: Backend error propagation ──

    #[test]
    fn test_backend_load_error_propagates() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        *backend.load_error.lock().unwrap() =
            Some(InferenceError::InferenceFailed("GPU OOM".to_string()));
        let engine = LlamaEngine::new(Box::new(backend));

        let result = engine.load_model(f.path().to_str().unwrap());
        match result.unwrap_err() {
            InferenceError::InferenceFailed(msg) => assert_eq!(msg, "GPU OOM"),
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
        assert!(!engine.is_loaded());
    }

    #[test]
    fn test_backend_generate_error_propagates() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        // Set generate error before handing backend to engine.
        // load() only reads load_error, so generate_error is untouched until generate().
        *backend.generate_error.lock().unwrap() =
            Some(InferenceError::InferenceFailed("context overflow".to_string()));
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let result = engine.generate("Hello", &GenerationParams::default());
        match result.unwrap_err() {
            InferenceError::InferenceFailed(msg) => assert_eq!(msg, "context overflow"),
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
    }

    // ── §3.1: Generation params respected ──

    #[test]
    fn test_generation_params_custom() {
        let f = temp_gguf_file();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let params = GenerationParams {
            max_tokens: 50,
            temperature: 0.0,
            top_p: 1.0,
            stop_sequences: vec!["\n".to_string()],
        };
        let result = engine.generate("Write a poem:", &params).unwrap();
        assert!(result.tokens_generated <= 50);
    }

    // ── §3.1: Thread safety (concurrent reads) ──

    #[test]
    fn test_concurrent_reads() {
        let f = temp_gguf_file();
        let path = f.path().to_str().unwrap().to_string();
        let backend = MockLlmBackend::new();
        let engine = LlamaEngine::new(Box::new(backend));
        engine.load_model(&path).unwrap();

        let engine_arc = Arc::new(engine);
        let mut handles = vec![];

        for _ in 0..4 {
            let e = Arc::clone(&engine_arc);
            handles.push(std::thread::spawn(move || {
                assert!(e.is_loaded());
                e.metadata().unwrap();
            }));
        }

        for h in handles {
            h.join().unwrap();
        }
    }
}
