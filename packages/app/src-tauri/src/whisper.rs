use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const TINY_MODEL: &str = "ggml-tiny.en.bin";
const LARGE_MODEL: &str = "ggml-large-v3-turbo.bin";

pub struct WhisperEngine {
    models_dir: PathBuf,
    tiny_ctx: Option<WhisperContext>,
    large_ctx: Option<WhisperContext>,
}

impl WhisperEngine {
    pub fn new() -> Self {
        let models_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.dstudio.rex")
            .join("models");
        std::fs::create_dir_all(&models_dir).ok();
        Self {
            models_dir,
            tiny_ctx: None,
            large_ctx: None,
        }
    }

    pub fn models_dir(&self) -> &PathBuf {
        &self.models_dir
    }

    pub fn tiny_model_path(&self) -> PathBuf {
        self.models_dir.join(TINY_MODEL)
    }

    pub fn large_model_path(&self) -> PathBuf {
        self.models_dir.join(LARGE_MODEL)
    }

    pub fn has_tiny_model(&self) -> bool {
        self.tiny_model_path().exists()
    }

    pub fn has_large_model(&self) -> bool {
        self.large_model_path().exists()
    }

    pub fn load_tiny(&mut self) -> Result<(), String> {
        let path = self.tiny_model_path();
        if !path.exists() {
            return Err(format!("Tiny model not found at {:?}", path));
        }
        let ctx = WhisperContext::new_with_params(
            path.to_str().unwrap(),
            WhisperContextParameters::default(),
        )
        .map_err(|e| format!("Failed to load tiny model: {e}"))?;
        self.tiny_ctx = Some(ctx);
        Ok(())
    }

    pub fn load_large(&mut self) -> Result<(), String> {
        let path = self.large_model_path();
        if !path.exists() {
            return Err(format!("Large model not found at {:?}", path));
        }
        let ctx = WhisperContext::new_with_params(
            path.to_str().unwrap(),
            WhisperContextParameters::default(),
        )
        .map_err(|e| format!("Failed to load large model: {e}"))?;
        self.large_ctx = Some(ctx);
        Ok(())
    }

    /// Transcribe audio samples (f32, 16kHz mono) with the tiny model (fast draft)
    pub fn transcribe_tiny(&self, samples: &[f32]) -> Result<String, String> {
        let ctx = self.tiny_ctx.as_ref().ok_or("Tiny model not loaded")?;
        transcribe(ctx, samples)
    }

    /// Transcribe audio samples with the large model (accurate)
    pub fn transcribe_large(&self, samples: &[f32]) -> Result<String, String> {
        let ctx = self.large_ctx.as_ref().ok_or("Large model not loaded")?;
        transcribe(ctx, samples)
    }
}

fn transcribe(ctx: &WhisperContext, samples: &[f32]) -> Result<String, String> {
    let mut state = ctx.create_state().map_err(|e| e.to_string())?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_no_timestamps(true);

    state.full(params, samples).map_err(|e| e.to_string())?;

    let n_segments = state.full_n_segments();
    let mut text = String::new();
    for i in 0..n_segments {
        if let Some(segment) = state.get_segment(i) {
            text.push_str(&segment.to_string());
        }
    }
    Ok(text.trim().to_string())
}

/// Detect code-like tokens and wrap in backticks
pub fn code_detect(text: &str) -> String {
    let mut result = String::new();
    for word in text.split_whitespace() {
        if !result.is_empty() {
            result.push(' ');
        }
        if is_code_token(word) {
            result.push('`');
            result.push_str(word);
            result.push('`');
        } else {
            result.push_str(word);
        }
    }
    result
}

fn is_code_token(word: &str) -> bool {
    // camelCase
    if word.len() > 2 && word.chars().any(|c| c.is_lowercase()) && word.chars().any(|c| c.is_uppercase()) && !word.starts_with(|c: char| c.is_uppercase()) {
        return true;
    }
    // snake_case
    if word.contains('_') && word.chars().all(|c| c.is_alphanumeric() || c == '_') && word.len() > 2 {
        return true;
    }
    // Common programming keywords
    let keywords = [
        "const", "let", "var", "function", "async", "await", "import", "export",
        "return", "if", "else", "for", "while", "class", "struct", "enum",
        "interface", "type", "fn", "pub", "mod", "use", "impl", "trait",
        "npm", "pnpm", "yarn", "git", "docker", "kubectl",
    ];
    keywords.contains(&word.to_lowercase().as_str())
}
