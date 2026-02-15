//! Inkwell Desktop — Tauri application library.
//!
//! Provides local inference (llama.cpp, whisper.cpp) and
//! a bridge between the Rust backend and the JS frontend.

pub mod inference;
pub mod bridge;
#[cfg(test)]
mod tests;

use std::sync::Arc;
use inference::llama::LlamaEngine;
use inference::whisper::WhisperEngine;

/// Shared application state managed by Tauri.
///
/// Holds Arc-wrapped engines so bridge commands can access them
/// via `tauri::State<AppState>`.
pub struct AppState {
    pub llm: Arc<LlamaEngine>,
    pub stt: Arc<WhisperEngine>,
}

/// Create the default `AppState` with appropriate backends.
///
/// With `local-inference` feature: uses real llama.cpp/whisper.cpp backends.
/// Without: uses stub backends that return helpful error messages.
#[cfg(not(test))]
fn create_app_state() -> AppState {
    let llm = {
        #[cfg(feature = "local-llm")]
        {
            use inference::llama_backend::RealLlmBackend;
            Arc::new(LlamaEngine::new(Box::new(RealLlmBackend::new())))
        }
        #[cfg(not(feature = "local-llm"))]
        {
            use inference::StubLlmBackend;
            Arc::new(LlamaEngine::new(Box::new(StubLlmBackend)))
        }
    };

    let stt = {
        #[cfg(feature = "local-stt")]
        {
            use inference::whisper_backend::RealSttBackend;
            Arc::new(WhisperEngine::new(Box::new(RealSttBackend::new())))
        }
        #[cfg(not(feature = "local-stt"))]
        {
            use inference::StubSttBackend;
            Arc::new(WhisperEngine::new(Box::new(StubSttBackend)))
        }
    };

    AppState { llm, stt }
}

#[cfg(not(test))]
mod app {
    use super::*;
    use bridge::commands;

    /// Run the Tauri application.
    pub fn run() {
        let state = create_app_state();

        tauri::Builder::default()
            .manage(state)
            .invoke_handler(tauri::generate_handler![
                commands::invoke_local_inference,
                commands::transcribe_audio,
                commands::get_system_info,
                commands::load_llm_model,
                commands::unload_llm_model,
                commands::llm_stream,
                commands::load_whisper_model,
                commands::unload_whisper_model,
                commands::transcribe_with_partials,
                commands::transcribe_audio_bytes,
            ])
            .run(tauri::generate_context!())
            .expect("error while running Inkwell desktop application");
    }
}

/// Run the Tauri application.
///
/// In test mode this is a no-op since `generate_context!()` requires
/// a real Tauri config and frontend build.
#[cfg(not(test))]
pub fn run() {
    app::run();
}

#[cfg(test)]
pub fn run() {
    // No-op in test mode — Tauri context requires frontend build
}
