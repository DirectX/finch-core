use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct LlmConfig {
    pub base_url: String,
    pub model: String,
    pub n_predict: u32,
    pub timeout_ms: u64,
    pub connect_timeout_ms: u64,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            base_url: "http://localhost:8080/completion".into(),
            model: "Qwen3.5-27B.Q4_K_M.gguf".into(),
            n_predict: 512,
            timeout_ms: 120_000,
            connect_timeout_ms: 5_000,
        }
    }
}

#[derive(Serialize)]
struct CompletionRequest<'a> {
    prompt: String,
    n_predict: u32,
    temperature: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<&'a str>>,
}

#[derive(Deserialize)]
struct CompletionResponse {
    content: String,
}

pub struct LlmClient {
    config: LlmConfig,
    http: Client,
}

impl LlmClient {
    pub fn new(config: LlmConfig) -> Self {
        let http = Client::builder()
            .timeout(Duration::from_millis(config.timeout_ms))
            .connect_timeout(Duration::from_millis(config.connect_timeout_ms))
            .build()
            .expect("failed to build HTTP client");
        Self { config, http }
    }

    pub async fn complete(&self, system: &str, user: &str) -> Result<String> {
        let prompt = format!(
            "<|im_start|>system\n{}<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n",
            system, user
        );

        let request = CompletionRequest {
            prompt,
            n_predict: self.config.n_predict,
            temperature: 0.0,
            stop: Some(vec!["<|im_end|>", "<|im_start|>"]),
        };

        let response = self
            .http
            .post(&self.config.base_url)
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("LLM request failed {}: {}", status, body));
        }

        let resp: CompletionResponse = response.json().await?;
        let content = strip_think_block(resp.content.trim());

        if content.is_empty() {
            return Err(anyhow!("LLM returned empty content"));
        }

        Ok(content)
    }
}

fn strip_think_block(s: &str) -> String {
    if let Some(end) = s.find("</think>") {
        s[end + "</think>".len()..].trim().to_string()
    } else if s.starts_with("<think>") {
        String::new()
    } else {
        s.to_string()
    }
}
