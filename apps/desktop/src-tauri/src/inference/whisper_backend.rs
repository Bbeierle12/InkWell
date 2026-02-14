//! Real STT backend powered by whisper-rs crate.
//!
//! This module is only compiled when the `local-inference` feature is enabled.
//! It provides `RealSttBackend` which implements `SttBackend` via whisper.cpp FFI.

use std::sync::Mutex;
use std::time::Instant;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use super::{InferenceError, ModelMetadata, SttBackend, TranscriptionResult};

/// Real STT backend using whisper.cpp via the `whisper-rs` crate.
pub struct RealSttBackend {
    inner: Mutex<Option<LoadedWhisper>>,
}

struct LoadedWhisper {
    ctx: WhisperContext,
}

impl RealSttBackend {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

impl SttBackend for RealSttBackend {
    fn load(&self, path: &str) -> Result<ModelMetadata, InferenceError> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(path, params).map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to load whisper model: {}", e))
        })?;

        let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

        *self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })? = Some(LoadedWhisper { ctx });

        Ok(ModelMetadata {
            name: "whisper".to_string(),
            size_bytes: file_size,
            context_length: None,
        })
    }

    fn transcribe(
        &self,
        audio: &[f32],
        language_hint: Option<&str>,
    ) -> Result<TranscriptionResult, InferenceError> {
        let guard = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        let loaded = guard.as_ref().ok_or(InferenceError::ModelNotLoaded)?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        if let Some(lang) = language_hint {
            params.set_language(Some(lang));
        } else {
            params.set_language(Some("en"));
        }
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        let start = Instant::now();

        let mut state = loaded.ctx.create_state().map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to create whisper state: {}", e))
        })?;

        state.full(params, audio).map_err(|e| {
            InferenceError::InferenceFailed(format!("Whisper transcription failed: {}", e))
        })?;

        let num_segments = state.full_n_segments().map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to get segments: {}", e))
        })?;

        let mut text = String::new();
        for i in 0..num_segments {
            let segment = state.full_get_segment_text(i).map_err(|e| {
                InferenceError::InferenceFailed(format!("Failed to get segment text: {}", e))
            })?;
            text.push_str(&segment);
        }

        let duration = start.elapsed();
        let detected_lang = language_hint.unwrap_or("en").to_string();

        Ok(TranscriptionResult {
            text: text.trim().to_string(),
            language: detected_lang,
            confidence: 0.9, // whisper-rs doesn't expose per-segment confidence easily
            duration_ms: duration.as_millis() as u64,
        })
    }

    fn transcribe_streaming(
        &self,
        audio: &[f32],
        language_hint: Option<&str>,
        on_partial: &mut dyn FnMut(&str),
    ) -> Result<TranscriptionResult, InferenceError> {
        let guard = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        let loaded = guard.as_ref().ok_or(InferenceError::ModelNotLoaded)?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        if let Some(lang) = language_hint {
            params.set_language(Some(lang));
        } else {
            params.set_language(Some("en"));
        }
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        let start = Instant::now();

        let mut state = loaded.ctx.create_state().map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to create whisper state: {}", e))
        })?;

        state.full(params, audio).map_err(|e| {
            InferenceError::InferenceFailed(format!("Whisper transcription failed: {}", e))
        })?;

        let num_segments = state.full_n_segments().map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to get segments: {}", e))
        })?;

        let mut full_text = String::new();
        for i in 0..num_segments {
            let segment = state.full_get_segment_text(i).map_err(|e| {
                InferenceError::InferenceFailed(format!("Failed to get segment text: {}", e))
            })?;
            full_text.push_str(&segment);
            // Emit partial result after each segment
            on_partial(full_text.trim());
        }

        let duration = start.elapsed();
        let detected_lang = language_hint.unwrap_or("en").to_string();

        Ok(TranscriptionResult {
            text: full_text.trim().to_string(),
            language: detected_lang,
            confidence: 0.9,
            duration_ms: duration.as_millis() as u64,
        })
    }

    fn unload(&self) -> Result<(), InferenceError> {
        *self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })? = None;
        Ok(())
    }
}
