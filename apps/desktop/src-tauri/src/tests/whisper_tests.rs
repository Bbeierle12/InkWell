//! §3.2 Whisper transcription integration tests.
//!
//! Lifecycle, empty/silence handling, and language detection.

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::sync::Arc;

    use crate::inference::whisper::{WhisperEngine, is_silence};
    use crate::inference::InferenceError;

    #[cfg(test)]
    use crate::inference::whisper::mock::MockSttBackend;

    const SAMPLE_RATE: usize = 16000;

    fn temp_bin_file() -> tempfile::NamedTempFile {
        let mut f = tempfile::Builder::new()
            .suffix(".bin")
            .tempfile()
            .expect("Failed to create temp bin file");
        f.write_all(b"WHISPER_FAKE").unwrap();
        f
    }

    fn fake_audio_secs(secs: f64) -> Vec<f32> {
        let samples = (SAMPLE_RATE as f64 * secs) as usize;
        (0..samples)
            .map(|i| {
                (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / SAMPLE_RATE as f32).sin()
                    * 0.5
            })
            .collect()
    }

    fn silence_audio(secs: f64) -> Vec<f32> {
        vec![0.0; (SAMPLE_RATE as f64 * secs) as usize]
    }

    /// §3.2 — Full lifecycle: create → load → transcribe → unload
    #[test]
    fn test_whisper_engine_lifecycle() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));

        // Initially unloaded
        assert!(!engine.is_loaded());

        // Load
        let meta = engine.load_model(f.path().to_str().unwrap()).unwrap();
        assert!(engine.is_loaded());
        assert_eq!(meta.name, "whisper-base");

        // Transcribe
        let audio = fake_audio_secs(2.0);
        let result = engine.transcribe(&audio, None).unwrap();
        assert_eq!(result.text, "Hello world.");
        assert_eq!(result.language, "en");
        assert!(result.confidence > 0.5);
        assert!(result.duration_ms > 0);

        // Unload
        engine.unload().unwrap();
        assert!(!engine.is_loaded());

        // Transcribe after unload fails
        let err = engine.transcribe(&audio, None).unwrap_err();
        assert_eq!(err, InferenceError::ModelNotLoaded);
    }

    /// §3.2 — Silence and empty audio handling
    #[test]
    fn test_whisper_empty_audio() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        // Empty buffer → error
        let err = engine.transcribe(&[], None).unwrap_err();
        match err {
            InferenceError::InvalidAudio(msg) => assert!(msg.contains("empty")),
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }

        // Too-short buffer → error
        let short = vec![0.5; 100];
        let err = engine.transcribe(&short, None).unwrap_err();
        match err {
            InferenceError::InvalidAudio(msg) => assert!(msg.contains("too short")),
            other => panic!("Expected InvalidAudio, got {:?}", other),
        }

        // Silence → empty text (not an error)
        let silent = silence_audio(1.0);
        let result = engine.transcribe(&silent, None).unwrap();
        assert!(result.text.is_empty());

        // Verify silence utility
        assert!(is_silence(&silent, 0.001));
        assert!(!is_silence(&fake_audio_secs(1.0), 0.001));
    }

    /// §3.2 — Language detection and hint passthrough
    #[test]
    fn test_whisper_language_detection() {
        let f = temp_bin_file();
        let backend = MockSttBackend::new();
        let engine = WhisperEngine::new(Box::new(backend));
        engine.load_model(f.path().to_str().unwrap()).unwrap();

        let audio = fake_audio_secs(2.0);

        // No hint → auto-detect (mock returns "en")
        let result = engine.transcribe(&audio, None).unwrap();
        assert_eq!(result.language, "en");

        // With hint → hint is used
        let result = engine.transcribe(&audio, Some("es")).unwrap();
        assert_eq!(result.language, "es");

        let result = engine.transcribe(&audio, Some("ja")).unwrap();
        assert_eq!(result.language, "ja");
    }

    /// §3.2 — Thread-safe concurrent transcription
    #[test]
    fn test_whisper_concurrent_transcribe() {
        let f = temp_bin_file();
        let path = f.path().to_str().unwrap().to_string();
        let backend = MockSttBackend::new();
        let engine = Arc::new(WhisperEngine::new(Box::new(backend)));
        engine.load_model(&path).unwrap();

        let mut handles = vec![];
        for i in 0..4 {
            let e = Arc::clone(&engine);
            handles.push(std::thread::spawn(move || {
                let audio = vec![0.1; 16000]; // 1 second of non-silence
                let result = e.transcribe(&audio, None);
                assert!(result.is_ok(), "Thread {} failed: {:?}", i, result);
            }));
        }

        for h in handles {
            h.join().expect("Thread panicked");
        }
    }
}
