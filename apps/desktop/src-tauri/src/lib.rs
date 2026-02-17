//! Inkwell Desktop — Tauri application library.
//!
//! Provides local inference (llama.cpp, whisper.cpp) and
//! a bridge between the Rust backend and the JS frontend.

pub mod inference;
pub mod bridge;
#[cfg(test)]
mod tests;

use std::sync::{Arc, Mutex};
use inference::llama::LlamaEngine;
use inference::whisper::WhisperEngine;

/// Shared application state managed by Tauri.
///
/// Holds Arc-wrapped engines so bridge commands can access them
/// via `tauri::State<AppState>`.
pub struct AppState {
    pub llm: Arc<LlamaEngine>,
    pub stt: Arc<WhisperEngine>,
    pub pending_file: Arc<Mutex<Option<String>>>,
    pub auth_pkce: Arc<Mutex<Option<OAuthPkceSession>>>,
}

#[derive(Debug, Clone)]
pub struct OAuthPkceSession {
    pub state: String,
    pub code_verifier: String,
    pub created_at_epoch_ms: u64,
}

/// Parse a deep-link URL into a file path.
///
/// Handles `inkwell://open?path=/some/file.inkwell` format.
pub fn parse_deep_link_path(url_str: &str) -> Option<String> {
    let parsed = url::Url::parse(url_str).ok()?;
    if parsed.scheme() != "inkwell" {
        return None;
    }
    // Look for ?path= query parameter
    for (key, value) in parsed.query_pairs() {
        if key == "path" {
            let path = value.to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}

/// Check whether a deep-link URL is an auth callback URL.
pub fn is_auth_callback_url(url_str: &str) -> bool {
    let parsed = match url::Url::parse(url_str) {
        Ok(url) => url,
        Err(_) => return false,
    };
    parsed.scheme() == "inkwell"
        && parsed.host_str() == Some("auth")
        && parsed.path() == "/callback"
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

    AppState {
        llm,
        stt,
        pending_file: Arc::new(Mutex::new(None)),
        auth_pkce: Arc::new(Mutex::new(None)),
    }
}

#[cfg(not(test))]
mod app {
    use super::*;
    use bridge::commands;
    use tauri::{Emitter, Listener};
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    use tauri::RunEvent;

    /// Run the Tauri application.
    pub fn run() {
        let state = create_app_state();
        let pending_file = state.pending_file.clone();

        // Check CLI args for a file path (e.g., double-click opens)
        let args: Vec<String> = std::env::args().collect();
        if args.len() > 1 {
            let candidate = &args[1];
            // Only accept file paths, not flags
            if !candidate.starts_with('-') && std::path::Path::new(candidate).exists() {
                if let Ok(mut pf) = pending_file.lock() {
                    *pf = Some(candidate.clone());
                }
            }
        }

        tauri::Builder::default()
            .plugin(tauri_plugin_deep_link::init())
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
                commands::save_file_dialog,
                commands::open_file_dialog,
                commands::write_text_file,
                commands::read_text_file,
                commands::get_models_dir,
                commands::check_models_status,
                commands::download_model,
                commands::get_pending_file,
                commands::secure_get_claude_api_key,
                commands::secure_set_claude_api_key,
                commands::secure_clear_claude_api_key,
                commands::auth_get_claude_status,
                commands::auth_start_claude_sign_in,
                commands::auth_complete_claude_sign_in,
                commands::auth_refresh_claude_token,
                commands::auth_sign_out_claude,
                commands::auth_invoke_claude_messages,
            ])
            .setup(|app| {
                // Deep-link handler: inkwell://open?path=...
                let app_handle = app.handle().clone();
                app.listen("deep-link://new-url", move |event| {
                    let payload = event.payload();
                    // Payload is a JSON string array from deep-link plugin
                    if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload) {
                        for url_str in urls {
                            if let Some(path) = parse_deep_link_path(&url_str) {
                                let _ = app_handle.emit("file-open-request", path);
                            } else if is_auth_callback_url(&url_str) {
                                let _ = app_handle.emit("auth-callback-url", url_str);
                            }
                        }
                    }
                });
                Ok(())
            })
            .build(tauri::generate_context!())
            .expect("error while building Inkwell desktop application")
            .run(|app_handle, event| {
                // macOS: handle files opened via Finder / file association
                #[cfg(any(target_os = "macos", target_os = "ios"))]
                if let RunEvent::Opened { urls } = &event {
                    for url in urls {
                        let path_str = url.to_string();
                        // file:// URLs from OS file associations
                        if let Ok(file_url) = url::Url::parse(&path_str) {
                            if file_url.scheme() == "file" {
                                if let Ok(path) = file_url.to_file_path() {
                                    let _ = app_handle.emit(
                                        "file-open-request",
                                        path.to_string_lossy().to_string(),
                                    );
                                }
                            }
                        } else {
                            // May be a plain path
                            let _ = app_handle.emit("file-open-request", path_str);
                        }
                    }
                }
                // Suppress unused variable warnings on non-macOS
                #[cfg(not(any(target_os = "macos", target_os = "ios")))]
                { let _ = (&app_handle, &event); }
            });
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

#[cfg(test)]
mod lib_tests {
    use super::*;

    #[test]
    fn test_parse_deep_link_path_valid() {
        let result = parse_deep_link_path("inkwell://open?path=/tmp/test.inkwell");
        assert_eq!(result, Some("/tmp/test.inkwell".to_string()));
    }

    #[test]
    fn test_parse_deep_link_path_encoded() {
        let result = parse_deep_link_path("inkwell://open?path=/my%20docs/file.inkwell");
        assert_eq!(result, Some("/my docs/file.inkwell".to_string()));
    }

    #[test]
    fn test_parse_deep_link_path_no_path_param() {
        let result = parse_deep_link_path("inkwell://open?foo=bar");
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_deep_link_path_wrong_scheme() {
        let result = parse_deep_link_path("https://open?path=/tmp/test.inkwell");
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_deep_link_path_empty_path() {
        let result = parse_deep_link_path("inkwell://open?path=");
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_deep_link_path_invalid_url() {
        let result = parse_deep_link_path("not a url at all");
        assert_eq!(result, None);
    }

    #[test]
    fn test_is_auth_callback_url_valid() {
        assert!(is_auth_callback_url("inkwell://auth/callback?code=abc&state=xyz"));
    }

    #[test]
    fn test_is_auth_callback_url_invalid_scheme() {
        assert!(!is_auth_callback_url("https://auth/callback?code=abc"));
    }

    #[test]
    fn test_is_auth_callback_url_invalid_host() {
        assert!(!is_auth_callback_url("inkwell://open/callback?code=abc"));
    }
}
