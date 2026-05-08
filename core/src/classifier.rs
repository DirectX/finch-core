use anyhow::Result;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use crate::clause_parser::{Clause, ClauseDomain, ClauseRole};
use crate::llm::LlmClient;

static SYSTEM_CLASSIFY: &str = r#"You are a legal document analysis assistant.
Analyze the provided contract clause and return a JSON object with the following fields:
- "role": one of "Obligation", "Right", "Condition", "Prohibition", or null
- "domain": one of "Payment", "Liability", "Termination", "Confidentiality", "Definition", or null
- "tags": array of short lowercase strings (e.g. ["force_majeure", "auto_renewal"])
- "risk_score": integer 1–5 (1=standard, 5=highly unusual or risky)
- "risk_reason": short string explaining the risk score
- "parties": array of party names mentioned (e.g. ["Buyer", "Seller"])
- "entities": object with keys "dates", "amounts", "governing_law" — each an array of strings found

Respond ONLY with valid JSON. No commentary, no markdown fences."#;

static SYSTEM_SUMMARY: &str = r#"You are a legal document analysis assistant.
Summarize the following contract clause in one sentence, plain English, no legal jargon.
Respond with a single sentence only."#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClauseEntities {
    pub dates: Vec<String>,
    pub amounts: Vec<String>,
    pub governing_law: Vec<String>,
}

impl Default for ClauseEntities {
    fn default() -> Self {
        Self { dates: vec![], amounts: vec![], governing_law: vec![] }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassificationResult {
    pub role: Option<ClauseRole>,
    pub domain: Option<ClauseDomain>,
    pub tags: Vec<String>,
    pub risk_score: u8,
    pub risk_reason: String,
    pub parties: Vec<String>,
    pub entities: ClauseEntities,
    pub summary: Option<String>,
}

impl Default for ClassificationResult {
    fn default() -> Self {
        Self {
            role: None,
            domain: None,
            tags: vec![],
            risk_score: 1,
            risk_reason: String::new(),
            parties: vec![],
            entities: ClauseEntities::default(),
            summary: None,
        }
    }
}

#[derive(Debug, Deserialize)]
struct LlmClassifyResponse {
    role: Option<String>,
    domain: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default = "default_risk")]
    risk_score: u8,
    #[serde(default)]
    risk_reason: String,
    #[serde(default)]
    parties: Vec<String>,
    #[serde(default)]
    entities: Option<serde_json::Value>,
}

fn default_risk() -> u8 { 1 }

fn parse_role(s: &str) -> Option<ClauseRole> {
    match s {
        "Obligation" => Some(ClauseRole::Obligation),
        "Right" => Some(ClauseRole::Right),
        "Condition" => Some(ClauseRole::Condition),
        "Prohibition" => Some(ClauseRole::Prohibition),
        _ => None,
    }
}

fn parse_domain(s: &str) -> Option<ClauseDomain> {
    match s {
        "Payment" => Some(ClauseDomain::Payment),
        "Liability" => Some(ClauseDomain::Liability),
        "Termination" => Some(ClauseDomain::Termination),
        "Confidentiality" => Some(ClauseDomain::Confidentiality),
        "Definition" => Some(ClauseDomain::Definition),
        _ => None,
    }
}

fn extract_json_from_response(raw: &str) -> &str {
    let raw = raw.trim();
    if let Some(start) = raw.find('{') {
        if let Some(end) = raw.rfind('}') {
            return &raw[start..=end];
        }
    }
    raw
}

pub struct ClassificationCache {
    conn: std::sync::Mutex<Connection>,
}

impl ClassificationCache {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS classification_cache (
                content_hash TEXT PRIMARY KEY,
                result_json  TEXT NOT NULL,
                classified_at TEXT NOT NULL
            );",
        )?;
        Ok(Self { conn: std::sync::Mutex::new(conn) })
    }

    pub fn get(&self, content_hash: &str) -> Option<ClassificationResult> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
                "SELECT result_json FROM classification_cache WHERE content_hash = ?1",
                params![content_hash],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
    }

    pub fn set(&self, content_hash: &str, result: &ClassificationResult) -> Result<()> {
        let json = serde_json::to_string(result)?;
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO classification_cache (content_hash, result_json, classified_at)
             VALUES (?1, ?2, ?3)",
            params![content_hash, json, now],
        )?;
        Ok(())
    }
}

pub struct Classifier {
    llm: LlmClient,
    cache: ClassificationCache,
}

impl Classifier {
    pub fn new(llm: LlmClient, cache: ClassificationCache) -> Self {
        Self { llm, cache }
    }

    pub async fn classify_clause(&self, clause: &Clause) -> Result<ClassificationResult> {
        if let Some(cached) = self.cache.get(&clause.content_hash) {
            return Ok(cached);
        }

        let text = clause.own_text();
        if text.trim().is_empty() {
            return Ok(ClassificationResult::default());
        }

        let raw = self.llm.complete(SYSTEM_CLASSIFY, &text).await?;
        let json_str = extract_json_from_response(&raw);

        let llm_resp: LlmClassifyResponse = serde_json::from_str(json_str)
            .map_err(|e| anyhow::anyhow!("failed to parse LLM classify JSON: {e}\nRaw: {raw}"))?;

        let entities = if let Some(ent) = llm_resp.entities {
            ClauseEntities {
                dates: json_array_strings(&ent, "dates"),
                amounts: json_array_strings(&ent, "amounts"),
                governing_law: json_array_strings(&ent, "governing_law"),
            }
        } else {
            ClauseEntities::default()
        };

        let summary = self.llm.complete(SYSTEM_SUMMARY, &text).await.ok();

        let result = ClassificationResult {
            role: llm_resp.role.as_deref().and_then(parse_role),
            domain: llm_resp.domain.as_deref().and_then(parse_domain),
            tags: llm_resp.tags,
            risk_score: llm_resp.risk_score.clamp(1, 5),
            risk_reason: llm_resp.risk_reason,
            parties: llm_resp.parties,
            entities,
            summary,
        };

        self.cache.set(&clause.content_hash, &result)?;
        Ok(result)
    }

    pub async fn classify_tree(&self, clauses: &mut Vec<Clause>) -> Vec<(String, ClassificationResult)> {
        let mut results = Vec::new();
        for clause in clauses.iter_mut() {
            Box::pin(self.classify_tree_inner(clause, &mut results)).await;
        }
        results
    }

    fn classify_tree_inner<'a>(
        &'a self,
        clause: &'a mut Clause,
        results: &'a mut Vec<(String, ClassificationResult)>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + 'a>> {
        Box::pin(async move {
            match self.classify_clause(clause).await {
                Ok(cr) => {
                    if clause.role.is_none() {
                        clause.role = cr.role.clone();
                    }
                    if clause.domain.is_none() {
                        clause.domain = cr.domain.clone();
                    }
                    if clause.tags.is_empty() {
                        clause.tags = cr.tags.clone();
                    }
                    results.push((clause.id.to_string(), cr));
                }
                Err(e) => {
                    eprintln!("LLM classification failed for clause '{}': {}", clause.title, e);
                }
            }

            for child in clause.children.iter_mut() {
                Box::pin(self.classify_tree_inner(child, results)).await;
            }
        })
    }
}

fn json_array_strings(val: &serde_json::Value, key: &str) -> Vec<String> {
    val.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_clean() {
        let raw = r#"{"role":"Obligation","domain":"Payment","tags":[],"risk_score":2,"risk_reason":"standard","parties":[],"entities":null}"#;
        let extracted = extract_json_from_response(raw);
        let v: serde_json::Value = serde_json::from_str(extracted).unwrap();
        assert_eq!(v["role"], "Obligation");
    }

    #[test]
    fn test_extract_json_with_preamble() {
        let raw = r#"Here is the result: {"role":"Prohibition","domain":null,"tags":["no_disclosure"],"risk_score":3,"risk_reason":"broad","parties":["Buyer"],"entities":null}"#;
        let extracted = extract_json_from_response(raw);
        let v: serde_json::Value = serde_json::from_str(extracted).unwrap();
        assert_eq!(v["role"], "Prohibition");
    }

    #[test]
    fn test_cache_round_trip() {
        let cache = ClassificationCache::open(":memory:").unwrap();
        let result = ClassificationResult {
            role: Some(ClauseRole::Obligation),
            domain: Some(ClauseDomain::Payment),
            tags: vec!["net30".into()],
            risk_score: 2,
            risk_reason: "standard payment term".into(),
            parties: vec!["Buyer".into()],
            entities: ClauseEntities {
                dates: vec!["30 days".into()],
                amounts: vec![],
                governing_law: vec![],
            },
            summary: Some("Buyer must pay within 30 days.".into()),
        };
        cache.set("abc123", &result).unwrap();
        let loaded = cache.get("abc123").unwrap();
        assert_eq!(loaded.risk_score, 2);
        assert_eq!(loaded.tags, vec!["net30"]);
        assert_eq!(loaded.parties, vec!["Buyer"]);
    }

    #[test]
    fn test_parse_role() {
        assert_eq!(parse_role("Obligation"), Some(ClauseRole::Obligation));
        assert_eq!(parse_role("Unknown"), None);
    }

    #[test]
    fn test_parse_domain() {
        assert_eq!(parse_domain("Liability"), Some(ClauseDomain::Liability));
        assert_eq!(parse_domain("Other"), None);
    }
}
