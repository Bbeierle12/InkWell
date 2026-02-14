//! Inkwell Desktop — Tauri application library.
//!
//! Provides local inference (llama.cpp, whisper.cpp) and
//! a bridge between the Rust backend and the JS frontend.

pub mod inference;
pub mod bridge;
#[cfg(test)]
mod tests;

#[cfg(not(test))]
mod tests_excluded {
    use super::bridge::commands;

    /// Run the Tauri application.
    pub fn run() {
        tauri::Builder::default()
            .invoke_handler(tauri::generate_handler![
                commands::invoke_local_inference,
                commands::transcribe_audio,
                commands::get_system_info,
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
    tests_excluded::run();
}

#[cfg(test)]
pub fn run() {
    // No-op in test mode — Tauri context requires frontend build
}
