//! whisper.cpp bindings for speech-to-text.
//!
//! `WhisperEngine` wraps an `SttBackend` trait object, managing model lifecycle
//! and audio validation. The real FFI backend (`whisper-rs`) is behind a feature flag;
//! tests use `MockSttBackend`.

use std::path::Path;
use std::sync::{Arc, Mutex};

use super::{InferenceError, ModelMetadata, SttBackend, TranscriptionResult};

/// Minimum audio sample count (100ms at 16kHz) below which we reject.
const MIN_AUDIO_SAMPLES: usize = 1600;

/// Maximum audio duration in seconds we accept (10 minutes).
const MAX_AUDIO_DURATION_SECS: f64 = 600.0;

/// Sample rate expected by Whisper models.
const SAMPLE_RATE: usize = 16000;

/// Model state for WhisperEngine.
#[derive(Debug, Clone, PartialEq)]
enum ModelState {
    Unloaded,
    Loaded(String),
}

/// Audio transcription engine powered by whisper.cpp.
///
/// Thread-safe: all access goes through `Mutex<WhisperInner>`.
pub struct WhisperEngine {
    inner: Arc<Mutex<WhisperInner>>,
}

struct WhisperInner {
    backend: Box<dyn SttBackend>,
    state: ModelState,
    metadata: Option<ModelMetadata>,
}

impl WhisperEngine {
    /// Create a new engine with the given backend.
    pub fn new(backend: Box<dyn SttBackend>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(WhisperInner {
                backend,
                state: ModelState::Unloaded,
                metadata: None,
            })),
        }
    }

    /// Load a Whisper model from the given path.
    ///
    /// Validates that the file exists and has a `.bin` extension.
    pub fn load_model(&self, path: &str) -> Result<ModelMetadata, InferenceError> {
        let p = Path::new(path);

        if !p.exists() {
            return Err(InferenceError::ModelNotFound(path.to_string()));
        }

        match p.extension().and_then(|e| e.to_str()) {
            Some("bin") => {}
            _ => {
                return Err(InferenceError::InvalidFormat(
                    "Expected .bin whisper model file".to_string(),
                ));
            }
        }

        let mut inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state != ModelState::Unloaded {
            let _ = inner.backend.unload();
        }

        let metadata = inner.backend.load(path)?;
        inner.state = ModelState::Loaded(path.to_string());
        inner.metadata = Some(metadata.clone());
        Ok(metadata)
    }

    /// Transcribe PCM f32 audio (16kHz mono).
    ///
    /// Validates audio length and sample values before delegating to backend.
    pub fn transcribe(
        &self,
        audio: &[f32],
        language_hint: Option<&str>,
    ) -> Result<TranscriptionResult, InferenceError> {
        let inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state == ModelState::Unloaded {
            return Err(InferenceError::ModelNotLoaded);
        }

        // Validate audio
        if audio.is_empty() {
            return Err(InferenceError::InvalidAudio(
                "Audio buffer is empty".to_string(),
            ));
        }

        if audio.len() < MIN_AUDIO_SAMPLES {
            return Err(InferenceError::InvalidAudio(format!(
                "Audio too short: {} samples (minimum {})",
                audio.len(),
                MIN_AUDIO_SAMPLES,
            )));
        }

        let duration_secs = audio.len() as f64 / SAMPLE_RATE as f64;
        if duration_secs > MAX_AUDIO_DURATION_SECS {
            return Err(InferenceError::InvalidAudio(format!(
                "Audio too long: {:.1}s (maximum {}s)",
                duration_secs, MAX_AUDIO_DURATION_SECS,
            )));
        }

        // Check for NaN/Inf samples
        if audio.iter().any(|s| !s.is_finite()) {
            return Err(InferenceError::InvalidAudio(
                "Audio contains NaN or Inf samples".to_string(),
            ));
        }

        inner.backend.transcribe(audio, language_hint)
    }

    /// Transcribe with streaming partial result callbacks.
    pub fn transcribe_streaming(
        &self,
        audio: &[f32],
        language_hint: Option<&str>,
        on_partial: &mut dyn FnMut(&str),
    ) -> Result<TranscriptionResult, InferenceError> {
        let inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state == ModelState::Unloaded {
            return Err(InferenceError::ModelNotLoaded);
        }

        if audio.is_empty() {
            return Err(InferenceError::InvalidAudio(
                "Audio buffer is empty".to_string(),
            ));
        }

        if audio.len() < MIN_AUDIO_SAMPLES {
            return Err(InferenceError::InvalidAudio(format!(
                "Audio too short: {} samples (minimum {})",
                audio.len(),
                MIN_AUDIO_SAMPLES,
            )));
        }

        let duration_secs = audio.len() as f64 / SAMPLE_RATE as f64;
        if duration_secs > MAX_AUDIO_DURATION_SECS {
            return Err(InferenceError::InvalidAudio(format!(
                "Audio too long: {:.1}s (maximum {}s)",
                duration_secs, MAX_AUDIO_DURATION_SECS,
            )));
        }

        if audio.iter().any(|s| !s.is_finite()) {
            return Err(InferenceError::InvalidAudio(
                "Audio contains NaN or Inf samples".to_string(),
            ));
        }

        inner.backend.transcribe_streaming(audio, language_hint, on_partial)
    }

    /// Check if a model is loaded.
    pub fn is_loaded(&self) -> bool {
        self.inner
            .lock()
            .map(|inner| inner.state != ModelState::Unloaded)
            .unwrap_or(false)
    }

    /// Get metadata about the loaded model.
    pub fn metadata(&self) -> Option<ModelMetadata> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.metadata.clone())
    }

    /// Unload the model and free resources.
    pub fn unload(&self) -> Result<(), InferenceError> {
        let mut inner = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        if inner.state == ModelState::Unloaded {
            return Ok(());
        }

        inner.backend.unload()?;
        inner.state = ModelState::Unloaded;
        inner.metadata = None;
        Ok(())
    }
}

/// Returns `true` if the audio buffer is effectively silence
/// (all samples below threshold).
pub fn is_silence(audio: &[f32], threshold: f32) -> bool {
    audio.iter().all(|s| s.abs() < threshold)
}

// ───────────────────── Mock Backend (test-only) ─────────────────────────

#[cfg(test)]
pub mod mock {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    /// Controllable mock for testing WhisperEngine.
    pub struct MockSttBackend {
        pub load_error: Mutex<Option<InferenceError>>,
        pub transcribe_error: Mutex<Option<InferenceError>>,
        pub transcribe_text: Mutex<String>,
        pub transcribe_language: Mutex<String>,
        pub transcribe_confidence: Mutex<f32>,
        pub is_loaded: AtomicBool,
        pub transcribe_call_count: AtomicUsize,
        pub load_call_count: AtomicUsize,
        pub last_language_hint: Mutex<Option<String>>,
    }

    impl MockSttBackend {
        pub fn new() -> Self {
            Self {
                load_error: Mutex::new(None),
                transcribe_error: Mutex::new(None),
                transcribe_text: Mutex::new("Hello world.".to_string()),
                transcribe_language: Mutex::new("en".to_string()),
                transcribe_confidence: Mutex::new(0.95),
                is_loaded: AtomicBool::new(false),
                transcribe_call_count: AtomicUsize::new(0),
                load_call_count: AtomicUsize::new(0),
                last_language_hint: Mutex::new(None),
            }
        }
    }

    impl SttBackend for MockSttBackend {
        fn load(&self, _path: &str) -> Result<ModelMetadata, InferenceError> {
            self.load_call_count.fetch_add(1, Ordering::SeqCst);
            if let Some(err) = self.load_error.lock().unwrap().take() {
                return Err(err);
            }
            self.is_loaded.store(true, Ordering::SeqCst);
            Ok(ModelMetadata {
                name: "whisper-base".to_string(),
                size_bytes: 150_000_000,
                context_length: None,
            })
        }

        fn transcribe(
            &self,
            audio: &[f32],
            language_hint: Option<&str>,
        ) -> Result<TranscriptionResult, InferenceError> {
            self.transcribe_call_count.fetch_add(1, Ordering::SeqCst);
            *self.last_language_hint.lock().unwrap() = language_hint.map(String::from);

            if let Some(err) = self.transcribe_error.lock().unwrap().take() {
                return Err(err);
            }

            // Detect silence
            let text = if is_silence(audio, 0.001) {
                String::new()
            } else {
                self.transcribe_text.lock().unwrap().clone()
            };

            let language = if let Some(hint) = language_hint {
                hint.to_string()
            } else {
                self.transcribe_language.lock().unwrap().clone()
            };

            let duration_ms = (audio.len() as u64 * 1000) / SAMPLE_RATE as u64;

            Ok(TranscriptionResult {
                text,
                language,
                confidence: *self.transcribe_confidence.lock().unwrap(),
                duration_ms,
            })
        }

        fn unload(&self) -> Result<(), InferenceError> {
            self.is_loaded.store(false, Ordering::SeqCst);
            Ok(())
        }
    }
}

// ──────────────────────────── Unit Tests ─────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use mock::MockSttBackend;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn temp_bin_file() -> NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".bin")
            .tempfile()
            .expect("Failed to create temp bin file");
        f.write_all(b"WHISPER_FAKE").unwrap();
        f
    }

    fn temp_wrong_ext() -> NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".onnx")
            .tempfile()
            .expect("Failed to create temp file");
        f.write_all(b"NOT_WHISPER").unwrap();
        f
    }

    /// Generate fake 16kHz PCM audio with a simple sine wave.
    fn fake_audio_secs(secs: f64) -> Vec<f32> {
        let samples = (SAMPLE_RATE as f64 * secs) as usize;
        (0..samples)
            .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / SAMPLE_RATE as f32).sin() * 0.5)
            .collect()
    }

    /// Generate silence audio.
    fn silence_audio(secs: f64) -> Vec<f32> {
        vec![0.0; (SAMPLE_RATE as f64 * secs) as usize]
    }

    // ── §3.2: Engine creation ──

    #[test]
    fn test_engine_creation() {
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        assert!(!engine.is_loaded());
        assert!(engine.metadata().is_none());
    }

    // ── §3.2: Transcribe without model → error ──

    #[test]
    fn test_transcribe_without_model_returns_error() {
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        let audio = fake_audio_secs(1.0);
        let result = engine.transcribe(&audio, None);
        assert_eq!(result.unwrap_err(), InferenceError::ModelNotLoaded);
    }

    // ── §3.2: Load nonexistent model ──

    #[test]
    fn test_load_nonexistent_model() {
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        let result = engine.load_model("/nonexistent/whisper.bin");
        assert_eq!(
            result.unwrap_err(),
            InferenceError::ModelNotFound("/nonexistent/whisper.bin".to_string())
        );
    }

    // ── §3.2: Load wrong extension ──

    #[test]
    fn test_load_wrong_extension() {
        let f = temp_wrong_ext();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        let result = engine.load_model(f.path().to_str().unwrap());
        match result.unwrap_err() {
            InferenceError::InvalidFormat(msg) => assert!(msg.contains(".bin")),
            other => panic!("Expected InvalidFormat, got {:?}", other),
        }
    }

    // ── §3.2: Successful load ──

    #[test]
    fn test_load_valid_model() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        let meta = engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert_eq!(meta.name, "whisper-base");
        assert!(engine.is_loaded());
    }

    // ── §3.2: Successful transcription ──

    #[test]
    fn test_transcribe_success() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = fake_audio_secs(2.0);
        let result = engine.transcribe(&audio, None).unwrap();
        assert_eq!(result.text, "Hello world.");
        assert_eq!(result.language, "en");
        assert!(result.confidence > 0.0);
        assert!(result.duration_ms > 0);
    }

    // ── §3.2: Empty audio rejected ──

    #[test]
    fn test_empty_audio_rejected() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let result = engine.transcribe(&[], None);
        match result.unwrap_err() {
            InferenceError::InvalidAudio(msg) => assert!(msg.contains("empty")),
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }
    }

    // ── §3.2: Audio too short ──

    #[test]
    fn test_audio_too_short_rejected() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let short_audio = vec![0.5; 100]; // < MIN_AUDIO_SAMPLES
        let result = engine.transcribe(&short_audio, None);
        match result.unwrap_err() {
            InferenceError::InvalidAudio(msg) => assert!(msg.contains("too short")),
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }
    }

    // ── §3.2: Audio with NaN rejected ──

    #[test]
    fn test_audio_with_nan_rejected() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let mut audio = fake_audio_secs(1.0);
        audio[500] = f32::NAN;
        let result = engine.transcribe(&audio, None);
        match result.unwrap_err() {
            InferenceError::InvalidAudio(msg) => assert!(msg.contains("NaN")),
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }
    }

    // ── §3.2: Silence detection ──

    #[test]
    fn test_silence_returns_empty_text() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = silence_audio(1.0);
        let result = engine.transcribe(&audio, None).unwrap();
        assert!(result.text.is_empty(), "Silence should produce empty text");
    }

    // ── §3.2: Language hint passed through ──

    #[test]
    fn test_language_hint_passthrough() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = fake_audio_secs(1.0);
        let result = engine.transcribe(&audio, Some("es")).unwrap();
        assert_eq!(result.language, "es");
    }

    // ── §6.3: Streaming transcribe via default fallback ──

    #[test]
    fn test_transcribe_streaming_via_default_fallback() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = fake_audio_secs(2.0);
        let mut partials = Vec::new();
        let result = engine
            .transcribe_streaming(&audio, None, &mut |partial| {
                partials.push(partial.to_string());
            })
            .unwrap();

        // Default fallback calls on_partial once with full text
        assert_eq!(partials.len(), 1);
        assert_eq!(partials[0], "Hello world.");
        assert_eq!(result.text, "Hello world.");
    }

    #[test]
    fn test_transcribe_streaming_no_model_rejected() {
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));

        let audio = fake_audio_secs(1.0);
        let result = engine.transcribe_streaming(&audio, None, &mut |_| {});
        assert_eq!(result.unwrap_err(), InferenceError::ModelNotLoaded);
    }

    // ── §3.2: Unload lifecycle ──

    #[test]
    fn test_unload_lifecycle() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));

        // Unload when unloaded is no-op
        engine.unload().unwrap();

        engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());

        engine.unload().unwrap();
        assert!(!engine.is_loaded());

        // Transcribe after unload fails
        let audio = fake_audio_secs(1.0);
        assert_eq!(
            engine.transcribe(&audio, None).unwrap_err(),
            InferenceError::ModelNotLoaded
        );
    }

    // ── §3.2: is_silence utility ──

    #[test]
    fn test_is_silence_utility() {
        assert!(is_silence(&[0.0, 0.0, 0.0], 0.001));
        assert!(is_silence(&[0.0001, -0.0001], 0.001));
        assert!(!is_silence(&[0.5, 0.0, 0.0], 0.001));
        assert!(!is_silence(&[0.0, 0.0, -0.5], 0.001));
        assert!(is_silence(&[], 0.001)); // empty is silence
    }

    // ── §3.2: Backend error propagation ──

    #[test]
    fn test_backend_transcribe_error_propagates() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        *backend.transcribe_error.lock().unwrap() =
            Some(InferenceError::InferenceFailed("decoder error".to_string()));
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = fake_audio_secs(1.0);
        match engine.transcribe(&audio, None).unwrap_err() {
            InferenceError::InferenceFailed(msg) => assert_eq!(msg, "decoder error"),
            other => panic!("Expected InferenceFailed, got {:?}", other),
        }
    }
}
