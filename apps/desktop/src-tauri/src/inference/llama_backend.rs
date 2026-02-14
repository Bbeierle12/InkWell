//! Real LLM backend powered by llama-cpp-2 crate.
//!
//! This module is only compiled when the `local-inference` feature is enabled.
//! It provides `RealLlmBackend` which implements `LlmBackend` via llama.cpp FFI.

use std::sync::Mutex;
use std::time::Instant;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend as LlamaCppBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;

use super::{GenerationParams, GenerationResult, InferenceError, LlmBackend, ModelMetadata};

/// Real LLM backend using llama.cpp via the `llama-cpp-2` crate.
///
/// Thread-safe: the inner model and context are protected by a Mutex.
pub struct RealLlmBackend {
    inner: Mutex<Option<LoadedModel>>,
}

struct LoadedModel {
    _backend: LlamaCppBackend,
    model: LlamaModel,
    context_length: u32,
}

impl RealLlmBackend {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

impl LlmBackend for RealLlmBackend {
    fn load(&self, path: &str) -> Result<ModelMetadata, InferenceError> {
        let backend = LlamaCppBackend::init().map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to init llama backend: {}", e))
        })?;

        let model_params = LlamaModelParams::default();
        let model = LlamaModel::load_from_file(&backend, path, &model_params).map_err(|e| {
            InferenceError::InferenceFailed(format!("Failed to load model: {}", e))
        })?;

        let ctx_params = LlamaContextParams::default();
        let n_ctx = ctx_params.n_ctx();

        let metadata = model.file_metadata();
        let name = metadata
            .and_then(|m| m.get("general.name").cloned())
            .unwrap_or_else(|| "unknown".to_string());

        let file_size = std::fs::metadata(path)
            .map(|m| m.len())
            .unwrap_or(0);

        let loaded = LoadedModel {
            _backend: backend,
            model,
            context_length: n_ctx,
        };

        *self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })? = Some(loaded);

        Ok(ModelMetadata {
            name,
            size_bytes: file_size,
            context_length: Some(n_ctx as usize),
        })
    }

    fn generate(
        &self,
        prompt: &str,
        params: &GenerationParams,
    ) -> Result<GenerationResult, InferenceError> {
        let mut tokens_text = String::new();
        let mut token_count = 0usize;
        let mut first_token_time: Option<Instant> = None;
        let start = Instant::now();

        self.generate_streaming(prompt, params, &mut |token| {
            if first_token_time.is_none() {
                first_token_time = Some(Instant::now());
            }
            tokens_text.push_str(token);
            token_count += 1;
        })?;

        let total_time = start.elapsed();
        let ttft = first_token_time
            .map(|t| t.duration_since(start).as_millis() as u64)
            .unwrap_or(total_time.as_millis() as u64);

        Ok(GenerationResult {
            text: tokens_text,
            tokens_generated: token_count,
            time_to_first_token_ms: ttft,
            total_time_ms: total_time.as_millis() as u64,
        })
    }

    fn generate_streaming(
        &self,
        prompt: &str,
        params: &GenerationParams,
        on_token: &mut dyn FnMut(&str),
    ) -> Result<GenerationResult, InferenceError> {
        let guard = self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })?;

        let loaded = guard.as_ref().ok_or(InferenceError::ModelNotLoaded)?;

        let ctx_params = LlamaContextParams::default();
        let mut ctx =
            loaded
                .model
                .new_context(&loaded._backend, ctx_params)
                .map_err(|e| {
                    InferenceError::InferenceFailed(format!("Failed to create context: {}", e))
                })?;

        // Tokenize the prompt
        let tokens = loaded
            .model
            .str_to_token(prompt, llama_cpp_2::model::AddBos::Always)
            .map_err(|e| {
                InferenceError::InferenceFailed(format!("Tokenization failed: {}", e))
            })?;

        // Evaluate prompt tokens
        ctx.decode(&mut llama_cpp_2::context::params::LlamaBatch::get_one(
            &tokens,
            0,
            false,
        ))
        .map_err(|e| {
            InferenceError::InferenceFailed(format!("Prompt evaluation failed: {}", e))
        })?;

        let start = Instant::now();
        let mut first_token_time: Option<Instant> = None;
        let mut generated_text = String::new();
        let mut generated_count = 0usize;

        // Generate tokens
        for _i in 0..params.max_tokens {
            let candidates = ctx.candidates_ith(tokens.len() as i32 + generated_count as i32 - 1);

            // Apply temperature and top-p sampling
            let token_id = if params.temperature <= 0.0 {
                candidates.sample_token_greedy()
            } else {
                candidates
                    .sample_temp(params.temperature)
                    .sample_top_p(params.top_p, 1)
                    .sample_token()
            };

            // Check for EOS
            if token_id == loaded.model.token_eos() {
                break;
            }

            let token_str = loaded.model.token_to_str(token_id).map_err(|e| {
                InferenceError::InferenceFailed(format!("Token decode failed: {}", e))
            })?;

            if first_token_time.is_none() {
                first_token_time = Some(Instant::now());
            }

            on_token(&token_str);
            generated_text.push_str(&token_str);
            generated_count += 1;

            // Check stop sequences
            if params
                .stop_sequences
                .iter()
                .any(|s| generated_text.ends_with(s))
            {
                break;
            }

            // Evaluate the new token
            ctx.decode(&mut llama_cpp_2::context::params::LlamaBatch::get_one(
                &[token_id],
                tokens.len() as i32 + generated_count as i32 - 1,
                false,
            ))
            .map_err(|e| {
                InferenceError::InferenceFailed(format!("Token evaluation failed: {}", e))
            })?;
        }

        let total_time = start.elapsed();
        let ttft = first_token_time
            .map(|t| t.duration_since(start).as_millis() as u64)
            .unwrap_or(total_time.as_millis() as u64);

        Ok(GenerationResult {
            text: generated_text,
            tokens_generated: generated_count,
            time_to_first_token_ms: ttft,
            total_time_ms: total_time.as_millis() as u64,
        })
    }

    fn unload(&self) -> Result<(), InferenceError> {
        *self.inner.lock().map_err(|_| {
            InferenceError::InferenceFailed("Lock poisoned".to_string())
        })? = None;
        Ok(())
    }
}
