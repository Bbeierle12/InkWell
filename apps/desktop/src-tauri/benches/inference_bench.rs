//! Criterion benchmarks for local inference performance.
//!
//! These benchmarks measure serialization overhead and mock engine throughput.
//! Real model benchmarks require actual GGUF/Whisper models.

use criterion::{criterion_group, criterion_main, Criterion};

fn bridge_serialization_overhead(c: &mut Criterion) {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    struct BenchRequest {
        prompt: String,
        max_tokens: usize,
    }

    #[derive(Serialize, Deserialize)]
    struct BenchResponse {
        text: String,
        tokens_generated: usize,
        time_ms: u64,
    }

    c.bench_function("serialize_inference_request", |b| {
        let req = BenchRequest {
            prompt: "The quick brown fox jumps over the lazy dog. ".repeat(10),
            max_tokens: 256,
        };
        b.iter(|| {
            std::hint::black_box(serde_json::to_string(&req).unwrap());
        })
    });

    c.bench_function("deserialize_inference_response", |b| {
        let json = serde_json::to_string(&BenchResponse {
            text: "Generated text output here ".repeat(20),
            tokens_generated: 100,
            time_ms: 150,
        })
        .unwrap();
        b.iter(|| {
            std::hint::black_box(serde_json::from_str::<BenchResponse>(&json).unwrap());
        })
    });
}

fn audio_validation_overhead(c: &mut Criterion) {
    c.bench_function("validate_audio_16k_1s", |b| {
        let audio: Vec<f32> = (0..16000)
            .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / 16000.0).sin())
            .collect();
        b.iter(|| {
            // Simulate the validation checks WhisperEngine performs
            let is_empty = audio.is_empty();
            let has_nan = audio.iter().any(|s| !s.is_finite());
            let duration = audio.len() as f64 / 16000.0;
            std::hint::black_box((is_empty, has_nan, duration));
        })
    });

    c.bench_function("validate_audio_16k_10s", |b| {
        let audio: Vec<f32> = (0..160000)
            .map(|i| (i as f32 * 440.0 * 2.0 * std::f32::consts::PI / 16000.0).sin())
            .collect();
        b.iter(|| {
            let has_nan = audio.iter().any(|s| !s.is_finite());
            std::hint::black_box(has_nan);
        })
    });
}

criterion_group!(benches, bridge_serialization_overhead, audio_validation_overhead);
criterion_main!(benches);
