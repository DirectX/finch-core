use std::sync::Arc;

use finch_core::api::{AppState, create_router};
use finch_core::llm::LlmConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let llm_config = LlmConfig::default();

    let state = Arc::new(
        AppState::new(
            "./docs/finch_versions.db",
            "./docs/finch_cache.db",
            llm_config,
        )?,
    );

    let app = create_router(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;

    println!("finch-core API listening on http://0.0.0.0:3000");
    axum::serve(listener, app).await?;

    Ok(())
}
