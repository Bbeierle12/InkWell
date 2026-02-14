//! Criterion benchmarks for Rust <-> JS bridge throughput.
//!
//! Measures JSON serialization/deserialization throughput for bridge payloads.

use criterion::{criterion_group, criterion_main, Criterion};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct InferenceResponse {
    text: String,
    tokens_generated: usize,
    time_ms: u64,
}

#[derive(Serialize, Deserialize)]
struct TranscribeResponse {
    text: String,
    language: String,
    duration_ms: u64,
}

#[derive(Serialize, Deserialize)]
struct SystemInfo {
    platform: String,
    has_gpu: bool,
    available_memory_mb: u64,
}

fn bridge_roundtrip_benchmark(c: &mut Criterion) {
    c.bench_function("inference_response_roundtrip", |b| {
        let resp = InferenceResponse {
            text: "The generated text output from the model that spans multiple sentences. This is a typical response length for inline suggestions in a word processor.".to_string(),
            tokens_generated: 42,
            time_ms: 150,
        };
        b.iter(|| {
            let json = serde_json::to_string(&resp).unwrap();
            let decoded: InferenceResponse = serde_json::from_str(&json).unwrap();
            std::hint::black_box(decoded);
        })
    });

    c.bench_function("transcribe_response_roundtrip", |b| {
        let resp = TranscribeResponse {
            text: "This is a longer transcription that might come from a 30 second audio clip dictated by a user working on their novel draft in the Inkwell word processor application.".to_string(),
            language: "en".to_string(),
            duration_ms: 30000,
        };
        b.iter(|| {
            let json = serde_json::to_string(&resp).unwrap();
            let decoded: TranscribeResponse = serde_json::from_str(&json).unwrap();
            std::hint::black_box(decoded);
        })
    });

    c.bench_function("system_info_roundtrip", |b| {
        let info = SystemInfo {
            platform: "windows".to_string(),
            has_gpu: true,
            available_memory_mb: 16384,
        };
        b.iter(|| {
            let json = serde_json::to_string(&info).unwrap();
            let decoded: SystemInfo = serde_json::from_str(&json).unwrap();
            std::hint::black_box(decoded);
        })
    });
}

criterion_group!(benches, bridge_roundtrip_benchmark);
criterion_main!(benches);
