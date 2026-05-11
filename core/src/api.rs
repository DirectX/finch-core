use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::{Arc, Mutex};

use axum::extract::Multipart;
use axum::response::sse::{Event, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch};
use axum::{Json, Router, extract::{Path, Query, State}, http::{StatusCode, header}};
use serde::{Deserialize, Serialize};
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use crate::classifier::{ClassificationCache, Classifier};
use crate::clause_parser::{build_clauses, Clause};
use crate::llm::{LlmClient, LlmConfig};
use crate::renderers::docx_renderer::{DocxRenderer, DocxRenderOptions};
use crate::renderers::typst_renderer::{TypstRenderOptions, TypstRenderer};
use crate::versioning::{diff_versions, DocumentVersion, DocumentVersionSummary, NegotiationState, VersionStore};

// ── State ─────────────────────────────────────────────────────────────────────

pub struct AppState {
    pub store: Mutex<VersionStore>,
    pub llm_config: LlmConfig,
    pub cache_path: String,
}

impl AppState {
    pub fn new(versions_db: &str, cache_db: &str, llm_config: LlmConfig) -> anyhow::Result<Self> {
        let store = VersionStore::open(versions_db)?;
        Ok(Self {
            store: Mutex::new(store),
            llm_config,
            cache_path: cache_db.to_string(),
        })
    }
}

// ── Error ─────────────────────────────────────────────────────────────────────

#[derive(Debug)]
#[allow(dead_code)]
enum ApiError {
    NotFound(String),
    BadRequest(String),
    Internal(anyhow::Error),
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        Self::Internal(e)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            Self::NotFound(m) => (StatusCode::NOT_FOUND, m),
            Self::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            Self::Internal(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        };
        (status, Json(serde_json::json!({ "error": msg }))).into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

// ── Router ────────────────────────────────────────────────────────────────────

pub fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/documents", get(list_documents).post(post_document))
        .route("/documents/{id}", get(get_document))
        .route("/documents/{id}/clauses", get(get_document_clauses))
        .route("/documents/{id}/clauses/{cid}", patch(patch_clause))
        .route("/documents/{id}/diff/{other}", get(get_diff))
        .route("/documents/{id}/render/pdf", get(get_render_pdf))
        .route("/documents/{id}/render/docx", get(get_render_docx))
        .route("/documents/{id}/risk", get(get_risk))
        .with_state(state)
}

// ── Parse helper ──────────────────────────────────────────────────────────────

fn parse_document_bytes(data: Vec<u8>, ext: String) -> anyhow::Result<Vec<Clause>> {
    use std::sync::Mutex as StdMutex;

    let tmp_in = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()?;
    std::fs::write(tmp_in.path(), &data)?;
    let tmp_in_path = tmp_in.path().to_owned();

    let tmp_out = tempfile::NamedTempFile::new()?;
    let tmp_out_path = tmp_out.path().to_owned();

    let blocks = Arc::new(StdMutex::new(Vec::new()));
    let blocks_for_filter = Arc::clone(&blocks);

    let mut p = pandoc::new();
    p.add_input(tmp_in_path.to_str().unwrap());
    p.set_output(pandoc::OutputKind::File(tmp_out_path));
    p.add_filter(move |json| {
        let bff = Arc::clone(&blocks_for_filter);
        pandoc_ast::filter(json, |pandoc| {
            for block in &pandoc.blocks {
                bff.lock().unwrap().push(block.clone());
            }
            pandoc
        })
    });
    p.execute().map_err(|e| anyhow::anyhow!("pandoc failed: {e:?}"))?;

    Ok(build_clauses(blocks.lock().unwrap().clone()))
}

// ── Tree helpers ──────────────────────────────────────────────────────────────

fn flat_clauses_owned(clauses: &[Clause]) -> HashMap<Uuid, Clause> {
    let mut map = HashMap::new();
    fn collect(clause: &Clause, map: &mut HashMap<Uuid, Clause>) {
        map.insert(clause.id, clause.clone());
        for child in &clause.children {
            collect(child, map);
        }
    }
    for c in clauses {
        collect(c, &mut map);
    }
    map
}

#[derive(Deserialize)]
struct PatchClauseRequest {
    title: Option<String>,
}

fn update_clause_in_tree(
    clauses: &mut Vec<Clause>,
    target_id: Uuid,
    req: &PatchClauseRequest,
) -> bool {
    for clause in clauses.iter_mut() {
        if clause.id == target_id {
            if let Some(new_title) = &req.title {
                clause.title = new_title.clone();
                use sha2::{Digest, Sha256};
                let mut hasher = Sha256::new();
                hasher.update(clause.title.as_bytes());
                clause.content_hash = hex::encode(hasher.finalize());
            }
            return true;
        }
        if update_clause_in_tree(&mut clause.children, target_id, req) {
            return true;
        }
    }
    false
}

// ── GET /documents ────────────────────────────────────────────────────────────

async fn list_documents(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<DocumentVersionSummary>>> {
    let summaries = state.store.lock().unwrap().list_all()?;
    Ok(Json(summaries))
}

// ── POST /documents ───────────────────────────────────────────────────────────

async fn post_document(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_ext = "md".to_string();
    let mut doc_title = "Untitled".to_string();
    let mut author = "api".to_string();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                let fname = field.file_name().unwrap_or("doc.md").to_string();
                if let Some(ext) = fname.rsplit('.').next() {
                    file_ext = ext.to_lowercase();
                }
                file_bytes = Some(field.bytes().await.unwrap_or_default().to_vec());
            }
            "title" => doc_title = field.text().await.unwrap_or_default(),
            "author" => author = field.text().await.unwrap_or_default(),
            _ => {}
        }
    }

    let bytes = match file_bytes {
        Some(b) if !b.is_empty() => b,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "no file field in multipart body"})),
            )
                .into_response()
        }
    };

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(64);

    tokio::spawn(async move {
        let ext = file_ext.clone();
        let parse_result =
            tokio::task::spawn_blocking(move || parse_document_bytes(bytes, ext)).await;

        let clauses = match parse_result {
            Ok(Ok(c)) => c,
            Ok(Err(e)) => {
                let _ = tx
                    .send(Ok(Event::default().event("error").data(e.to_string())))
                    .await;
                return;
            }
            Err(e) => {
                let _ = tx
                    .send(Ok(Event::default().event("error").data(e.to_string())))
                    .await;
                return;
            }
        };

        let doc_id = Uuid::new_v4();
        let version_number = {
            let store = state.store.lock().unwrap();
            store.next_version_number(doc_id).unwrap_or(1)
        };

        let version = DocumentVersion::new(
            doc_id,
            version_number,
            vec![],
            NegotiationState::Draft,
            author,
            format!("Uploaded: {doc_title}"),
            clauses,
        );

        {
            let save_result = {
                let store = state.store.lock().unwrap();
                store.save_version(&version)
            };
            if let Err(e) = save_result {
                let _ = tx
                    .send(Ok(Event::default().event("error").data(e.to_string())))
                    .await;
                return;
            }
        }

        if let Ok(json) = serde_json::to_string(&version) {
            let _ = tx.send(Ok(Event::default().event("version").data(json))).await;
        }

        let cache = match ClassificationCache::open(&state.cache_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to open classification cache: {e}");
                let _ = tx.send(Ok(Event::default().event("done").data(""))).await;
                return;
            }
        };

        let classifier = Classifier::new(LlmClient::new(state.llm_config.clone()), cache);
        let flat = flat_clauses_owned(&version.clauses);

        let total = flat.len();
        let mut count = 0;

        for (clause_id, clause) in &flat {
            count += 1;
            let _ = tx
                .send(Ok(Event::default().event("progress").data(format!("Classifying clause {count}/{total}..."))))
                .await;

            match classifier.classify_clause(clause).await {
                Ok(result) => {
                    if let Ok(json) = serde_json::to_string(&serde_json::json!({
                        "clause_id": clause_id,
                        "result": result,
                    })) {
                        let _ = tx
                            .send(Ok(Event::default().event("classification").data(json)))
                            .await;
                    }
                }
                Err(e) => {
                    eprintln!("Classification error for clause {clause_id}: {e}");
                    let _ = tx
                        .send(Ok(Event::default().event("error").data(format!("Classification error: {e}"))))
                        .await;
                }
            }
        }

        let _ = tx.send(Ok(Event::default().event("done").data(""))).await;
    });

    Sse::new(ReceiverStream::new(rx)).into_response()
}

// ── GET /documents/:id ────────────────────────────────────────────────────────

async fn get_document(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<DocumentVersion>> {
    let version = {
        let store = state.store.lock().unwrap();
        store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
    };
    Ok(Json(version))
}

// ── GET /documents/:id/clauses ────────────────────────────────────────────────

#[derive(Serialize)]
struct FlatClauseEntry {
    id: Uuid,
    title: String,
    level: i32,
    role: Option<String>,
    domain: Option<String>,
    primary_role: Option<String>,
    tags: Vec<String>,
    content_hash: String,
    number: Option<Vec<String>>,
}

impl From<&Clause> for FlatClauseEntry {
    fn from(c: &Clause) -> Self {
        Self {
            id: c.id,
            title: c.title.clone(),
            level: c.level,
            role: c.role.as_ref().map(|r| format!("{r:?}")),
            domain: c.domain.as_ref().map(|d| format!("{d:?}")),
            primary_role: c.primary_role.as_ref().map(|r| format!("{r:?}")),
            tags: c.tags.clone(),
            content_hash: c.content_hash.clone(),
            number: c.number.clone(),
        }
    }
}

async fn get_document_clauses(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<Vec<FlatClauseEntry>>> {
    let version = {
        let store = state.store.lock().unwrap();
        store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
    };
    let flat = flat_clauses_owned(&version.clauses);
    let mut entries: Vec<FlatClauseEntry> = flat.values().map(FlatClauseEntry::from).collect();
    entries.sort_by(|a, b| a.level.cmp(&b.level).then(a.title.cmp(&b.title)));
    Ok(Json(entries))
}

// ── PATCH /documents/:id/clauses/:cid ────────────────────────────────────────

async fn patch_clause(
    State(state): State<Arc<AppState>>,
    Path((id, cid)): Path<(Uuid, Uuid)>,
    Json(req): Json<PatchClauseRequest>,
) -> ApiResult<Json<DocumentVersion>> {
    let version = {
        let store = state.store.lock().unwrap();
        store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
    };

    let mut new_clauses = version.clauses.clone();
    if !update_clause_in_tree(&mut new_clauses, cid, &req) {
        return Err(ApiError::NotFound(format!("clause {cid} not found in version {id}")));
    }

    let (version_number, doc_id, state_val) = {
        let store = state.store.lock().unwrap();
        let vn = store.next_version_number(version.document_id).unwrap_or(2);
        (vn, version.document_id, version.state.clone())
    };

    let new_version = DocumentVersion::new(
        doc_id,
        version_number,
        vec![id],
        state_val,
        "api",
        format!("Edited clause {cid}"),
        new_clauses,
    );

    {
        let store = state.store.lock().unwrap();
        store.save_version(&new_version).map_err(ApiError::from)?;
    }

    Ok(Json(new_version))
}

// ── GET /documents/:id/diff/:other ────────────────────────────────────────────

async fn get_diff(
    State(state): State<Arc<AppState>>,
    Path((id, other)): Path<(Uuid, Uuid)>,
) -> ApiResult<Json<crate::versioning::VersionDiff>> {
    let (from, to) = {
        let store = state.store.lock().unwrap();
        let from = store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?;
        let to = store
            .load_version(other)
            .map_err(|_| ApiError::NotFound(format!("version {other} not found")))?;
        (from, to)
    };
    Ok(Json(diff_versions(&from, &to)))
}

// ── GET /documents/:id/render/pdf ───────────────────────────────────────────

#[derive(Deserialize, Default)]
struct RenderPdfRequest {
    title: Option<String>,
    author: Option<String>,
    show_risk_scores: Option<bool>,
    show_role_badges: Option<bool>,
}

async fn get_render_pdf(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Query(req): Query<RenderPdfRequest>,
) -> ApiResult<Response> {
    let version = {
        let store = state.store.lock().unwrap();
        store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
    };

    let opts = TypstRenderOptions {
        title: req
            .title
            .unwrap_or_else(|| format!("Document {id}")),
        author: req.author,
        date: None,
        show_risk_scores: req.show_risk_scores.unwrap_or(true),
        show_role_badges: req.show_role_badges.unwrap_or(true),
    };

    let tmp = tempfile::Builder::new()
        .suffix(".pdf")
        .tempfile()
        .map_err(|e| ApiError::Internal(e.into()))?;
    let pdf_path = tmp.path().to_owned();

    let results: HashMap<Uuid, crate::classifier::ClassificationResult> = {
        match ClassificationCache::open(&state.cache_path) {
            Ok(cache) => {
                let flat = flat_clauses_owned(&version.clauses);
                flat.iter()
                    .filter_map(|(id, c)| cache.get(&c.content_hash).map(|r| (*id, r)))
                    .collect()
            }
            Err(_) => HashMap::new(),
        }
    };

    TypstRenderer::render_pdf(&version.clauses, &results, &pdf_path, &opts)
        .map_err(|e| ApiError::Internal(e))?;

    let bytes = std::fs::read(&pdf_path).map_err(|e| ApiError::Internal(e.into()))?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"document.pdf\"",
            ),
        ],
        bytes,
    )
        .into_response())
}

// ── GET /documents/:id/render/docx ───────────────────────────────────────────

#[derive(Deserialize, Default)]
struct RenderDocxRequest {
    title: Option<String>,
    compare_to: Option<Uuid>,
    author: Option<String>,
}

async fn get_render_docx(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
    Query(req): Query<RenderDocxRequest>,
) -> ApiResult<Response> {
    let title = req.title.unwrap_or_else(|| format!("Document {id}"));
    let author = req.author.unwrap_or_else(|| "finch-core".to_string());

    let tmp = tempfile::Builder::new()
        .suffix(".docx")
        .tempfile()
        .map_err(|e| ApiError::Internal(e.into()))?;
    let docx_path = tmp.path().to_owned();

    if let Some(compare_id) = req.compare_to {
        let (from_version, to_version) = {
            let store = state.store.lock().unwrap();
            let from = store
                .load_version(compare_id)
                .map_err(|_| ApiError::NotFound(format!("version {compare_id} not found")))?;
            let to = store
                .load_version(id)
                .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?;
            (from, to)
        };
        let diff = diff_versions(&from_version, &to_version);
        let opts = DocxRenderOptions {
            author,
            date: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        };
        DocxRenderer::render_redlined(
            &diff,
            &from_version.clauses,
            &to_version.clauses,
            &title,
            &docx_path,
            &opts,
        )
        .map_err(ApiError::from)?;
    } else {
        let version = {
            let store = state.store.lock().unwrap();
            store
                .load_version(id)
                .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
        };
        DocxRenderer::render_clean(&version.clauses, &title, &docx_path)
            .map_err(ApiError::from)?;
    }

    let bytes = std::fs::read(&docx_path).map_err(|e| ApiError::Internal(e.into()))?;

    Ok((
        [
            (
                header::CONTENT_TYPE,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"document.docx\"",
            ),
        ],
        bytes,
    )
        .into_response())
}

// ── GET /documents/:id/risk ───────────────────────────────────────────────────

#[derive(Serialize)]
struct RiskReport {
    document_version_id: Uuid,
    total_clauses: usize,
    classified_clauses: usize,
    risk_distribution: HashMap<u8, usize>,
    high_risk_clauses: Vec<ClauseRiskEntry>,
}

#[derive(Serialize)]
struct ClauseRiskEntry {
    clause_id: Uuid,
    title: String,
    risk_score: u8,
    risk_reason: String,
    domain: Option<String>,
    role: Option<String>,
}

async fn get_risk(
    State(state): State<Arc<AppState>>,
    Path(id): Path<Uuid>,
) -> ApiResult<Json<RiskReport>> {
    let version = {
        let store = state.store.lock().unwrap();
        store
            .load_version(id)
            .map_err(|_| ApiError::NotFound(format!("version {id} not found")))?
    };

    let flat = flat_clauses_owned(&version.clauses);
    let total_clauses = flat.len();

    let cache = ClassificationCache::open(&state.cache_path)
        .map_err(ApiError::from)?;

    let mut classified_clauses = 0usize;
    let mut distribution: HashMap<u8, usize> = HashMap::new();
    let mut entries: Vec<ClauseRiskEntry> = Vec::new();

    for (clause_id, clause) in &flat {
        if let Some(result) = cache.get(&clause.content_hash) {
            classified_clauses += 1;
            *distribution.entry(result.risk_score).or_insert(0) += 1;
            entries.push(ClauseRiskEntry {
                clause_id: *clause_id,
                title: clause.title.clone(),
                risk_score: result.risk_score,
                risk_reason: result.risk_reason,
                domain: result.domain.as_ref().map(|d| format!("{d:?}")),
                role: result.role.as_ref().map(|r| format!("{r:?}")),
            });
        }
    }

    entries.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    let high_risk_clauses = entries
        .into_iter()
        .filter(|e| e.risk_score >= 4)
        .collect();

    Ok(Json(RiskReport {
        document_version_id: id,
        total_clauses,
        classified_clauses,
        risk_distribution: distribution,
        high_risk_clauses,
    }))
}
