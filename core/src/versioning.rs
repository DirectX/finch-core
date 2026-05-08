use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::clause_parser::Clause;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum NegotiationState {
    Draft,
    UnderReview,
    Negotiating,
    Agreed,
    Rejected,
    Superseded,
}

impl NegotiationState {
    pub fn can_transition_to(&self, next: &NegotiationState) -> bool {
        use NegotiationState::*;
        matches!(
            (self, next),
            (Draft, UnderReview)
                | (Draft, Rejected)
                | (UnderReview, Negotiating)
                | (UnderReview, Agreed)
                | (UnderReview, Rejected)
                | (Negotiating, Agreed)
                | (Negotiating, Rejected)
                | (Negotiating, Negotiating)
                | (Agreed, Superseded)
                | (Rejected, Draft)
        )
    }
}

impl std::fmt::Display for NegotiationState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentVersion {
    pub id: Uuid,
    pub document_id: Uuid,
    pub version_number: u32,
    pub parent_ids: Vec<Uuid>,
    pub state: NegotiationState,
    pub author: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
    pub clauses: Vec<Clause>,
}

impl DocumentVersion {
    pub fn new(
        document_id: Uuid,
        version_number: u32,
        parent_ids: Vec<Uuid>,
        state: NegotiationState,
        author: impl Into<String>,
        message: impl Into<String>,
        clauses: Vec<Clause>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            document_id,
            version_number,
            parent_ids,
            state,
            author: author.into(),
            message: message.into(),
            created_at: Utc::now(),
            clauses,
        }
    }

    pub fn flat_clauses(&self) -> HashMap<Uuid, &Clause> {
        let mut map = HashMap::new();
        fn collect<'a>(clause: &'a Clause, map: &mut HashMap<Uuid, &'a Clause>) {
            map.insert(clause.id, clause);
            for child in &clause.children {
                collect(child, map);
            }
        }
        for clause in &self.clauses {
            collect(clause, &mut map);
        }
        map
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentVersionSummary {
    pub id: Uuid,
    pub document_id: Uuid,
    pub version_number: u32,
    pub state: NegotiationState,
    pub author: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClauseDiffKind {
    Added,
    Removed,
    Modified { similarity: f64, text_before: String, text_after: String },
    Unchanged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClauseDiff {
    pub clause_id: Uuid,
    pub title: String,
    pub kind: ClauseDiffKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionDiff {
    pub from_version_id: Uuid,
    pub to_version_id: Uuid,
    pub diffs: Vec<ClauseDiff>,
    pub added_count: usize,
    pub removed_count: usize,
    pub modified_count: usize,
    pub unchanged_count: usize,
}

pub fn diff_versions(from: &DocumentVersion, to: &DocumentVersion) -> VersionDiff {
    let from_map = from.flat_clauses();
    let to_map = to.flat_clauses();

    let mut diffs = Vec::new();

    for (id, to_clause) in &to_map {
        if let Some(from_clause) = from_map.get(id) {
            if from_clause.content_hash == to_clause.content_hash {
                diffs.push(ClauseDiff {
                    clause_id: *id,
                    title: to_clause.title.clone(),
                    kind: ClauseDiffKind::Unchanged,
                });
            } else {
                let text_before = from_clause.own_text();
                let text_after = to_clause.own_text();
                let similarity = jaccard_similarity(&text_before, &text_after);
                diffs.push(ClauseDiff {
                    clause_id: *id,
                    title: to_clause.title.clone(),
                    kind: ClauseDiffKind::Modified { similarity, text_before, text_after },
                });
            }
        } else {
            diffs.push(ClauseDiff {
                clause_id: *id,
                title: to_clause.title.clone(),
                kind: ClauseDiffKind::Added,
            });
        }
    }

    for (id, from_clause) in &from_map {
        if !to_map.contains_key(id) {
            diffs.push(ClauseDiff {
                clause_id: *id,
                title: from_clause.title.clone(),
                kind: ClauseDiffKind::Removed,
            });
        }
    }

    let added_count = diffs.iter().filter(|d| matches!(d.kind, ClauseDiffKind::Added)).count();
    let removed_count = diffs.iter().filter(|d| matches!(d.kind, ClauseDiffKind::Removed)).count();
    let modified_count = diffs.iter().filter(|d| matches!(d.kind, ClauseDiffKind::Modified { .. })).count();
    let unchanged_count = diffs.iter().filter(|d| matches!(d.kind, ClauseDiffKind::Unchanged)).count();

    VersionDiff {
        from_version_id: from.id,
        to_version_id: to.id,
        diffs,
        added_count,
        removed_count,
        modified_count,
        unchanged_count,
    }
}

pub fn jaccard_similarity(a: &str, b: &str) -> f64 {
    let set_a: HashSet<&str> = a.split_whitespace().collect();
    let set_b: HashSet<&str> = b.split_whitespace().collect();
    if set_a.is_empty() && set_b.is_empty() {
        return 1.0;
    }
    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();
    if union == 0 { 1.0 } else { intersection as f64 / union as f64 }
}

pub struct VersionStore {
    conn: Connection,
}

impl VersionStore {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS document_versions (
                id              TEXT PRIMARY KEY,
                document_id     TEXT NOT NULL,
                version_number  INTEGER NOT NULL,
                parent_ids      TEXT NOT NULL,
                state           TEXT NOT NULL,
                author          TEXT NOT NULL,
                message         TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                clauses_json    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_doc_id
                ON document_versions (document_id, version_number);",
        )?;
        Ok(Self { conn })
    }

    pub fn save_version(&self, version: &DocumentVersion) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO document_versions
             (id, document_id, version_number, parent_ids, state, author, message, created_at, clauses_json)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                version.id.to_string(),
                version.document_id.to_string(),
                version.version_number,
                serde_json::to_string(&version.parent_ids)?,
                serde_json::to_string(&version.state)?,
                version.author,
                version.message,
                version.created_at.to_rfc3339(),
                serde_json::to_string(&version.clauses)?,
            ],
        )?;
        Ok(())
    }

    pub fn load_version(&self, id: Uuid) -> Result<DocumentVersion> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, version_number, parent_ids, state,
                    author, message, created_at, clauses_json
             FROM document_versions WHERE id = ?1",
        )?;
        let row: (String, String, u32, String, String, String, String, String, String) =
            stmt.query_row(params![id.to_string()], |r| {
                Ok((
                    r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?,
                    r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?,
                ))
            })?;

        Ok(DocumentVersion {
            id: Uuid::parse_str(&row.0)?,
            document_id: Uuid::parse_str(&row.1)?,
            version_number: row.2,
            parent_ids: serde_json::from_str(&row.3)?,
            state: serde_json::from_str(&row.4)?,
            author: row.5,
            message: row.6,
            created_at: row.7.parse::<DateTime<Utc>>()
                .map_err(|e| anyhow!("bad datetime: {e}"))?,
            clauses: serde_json::from_str(&row.8)?,
        })
    }

    pub fn get_history(&self, document_id: Uuid) -> Result<Vec<DocumentVersion>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM document_versions
             WHERE document_id = ?1
             ORDER BY version_number ASC",
        )?;
        let ids: Vec<String> = stmt
            .query_map(params![document_id.to_string()], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        ids.iter()
            .map(|id| self.load_version(Uuid::parse_str(id)?))
            .collect()
    }

    pub fn diff_by_ids(&self, from_id: Uuid, to_id: Uuid) -> Result<VersionDiff> {
        let from = self.load_version(from_id)?;
        let to = self.load_version(to_id)?;
        Ok(diff_versions(&from, &to))
    }

    pub fn next_version_number(&self, document_id: Uuid) -> Result<u32> {
        let n: u32 = self.conn.query_row(
            "SELECT COALESCE(MAX(version_number), 0) FROM document_versions WHERE document_id = ?1",
            params![document_id.to_string()],
            |r| r.get(0),
        )?;
        Ok(n + 1)
    }

    pub fn list_all(&self) -> Result<Vec<DocumentVersionSummary>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, document_id, version_number, state, author, message, created_at
             FROM document_versions
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, u32>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
            ))
        })?;
        let mut summaries = Vec::new();
        for row in rows {
            let (id, doc_id, vn, state, author, message, created_at) = row?;
            summaries.push(DocumentVersionSummary {
                id: Uuid::parse_str(&id)?,
                document_id: Uuid::parse_str(&doc_id)?,
                version_number: vn,
                state: serde_json::from_str(&state)?,
                author,
                message,
                created_at: created_at.parse::<DateTime<Utc>>()
                    .map_err(|e| anyhow!("bad datetime: {e}"))?,
            });
        }
        Ok(summaries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clause_parser::{ClauseDomain, ClauseRole};

    fn make_clause(id: Uuid, title: &str, hash: &str) -> Clause {
        Clause {
            id,
            content_hash: hash.to_string(),
            role: None,
            domain: None,
            aggregated_roles: vec![],
            aggregated_domains: vec![],
            primary_role: None,
            tags: vec![],
            level: 2,
            title: title.to_string(),
            number: None,
            content: vec![],
            children: vec![],
        }
    }

    fn make_version(doc_id: Uuid, vn: u32, clauses: Vec<Clause>) -> DocumentVersion {
        DocumentVersion::new(doc_id, vn, vec![], NegotiationState::Draft, "alice", "test", clauses)
    }

    #[test]
    fn test_negotiation_state_valid_transitions() {
        use NegotiationState::*;
        assert!(Draft.can_transition_to(&UnderReview));
        assert!(UnderReview.can_transition_to(&Negotiating));
        assert!(Negotiating.can_transition_to(&Agreed));
        assert!(Agreed.can_transition_to(&Superseded));
        assert!(Rejected.can_transition_to(&Draft));
    }

    #[test]
    fn test_negotiation_state_invalid_transitions() {
        use NegotiationState::*;
        assert!(!Draft.can_transition_to(&Agreed));
        assert!(!Agreed.can_transition_to(&Draft));
        assert!(!Negotiating.can_transition_to(&Draft));
        assert!(!Superseded.can_transition_to(&Draft));
    }

    #[test]
    fn test_jaccard_identical() {
        assert!((jaccard_similarity("the quick brown fox", "the quick brown fox") - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_jaccard_disjoint() {
        assert!((jaccard_similarity("alpha beta gamma", "delta epsilon zeta") - 0.0).abs() < 1e-9);
    }

    #[test]
    fn test_jaccard_partial() {
        let sim = jaccard_similarity("shall pay the fee within thirty days", "shall pay the fee within sixty days");
        assert!(sim > 0.5 && sim < 1.0, "expected partial similarity, got {sim}");
    }

    #[test]
    fn test_jaccard_empty() {
        assert!((jaccard_similarity("", "") - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_diff_unchanged() {
        let doc_id = Uuid::new_v4();
        let cid = Uuid::new_v4();
        let v1 = make_version(doc_id, 1, vec![make_clause(cid, "Payment", "hash1")]);
        let v2 = make_version(doc_id, 2, vec![make_clause(cid, "Payment", "hash1")]);
        let diff = diff_versions(&v1, &v2);
        assert_eq!(diff.unchanged_count, 1);
        assert_eq!(diff.modified_count, 0);
        assert_eq!(diff.added_count, 0);
        assert_eq!(diff.removed_count, 0);
    }

    #[test]
    fn test_diff_modified() {
        let doc_id = Uuid::new_v4();
        let cid = Uuid::new_v4();
        let v1 = make_version(doc_id, 1, vec![make_clause(cid, "Payment", "hash1")]);
        let v2 = make_version(doc_id, 2, vec![make_clause(cid, "Payment", "hash2")]);
        let diff = diff_versions(&v1, &v2);
        assert_eq!(diff.modified_count, 1);
        assert_eq!(diff.unchanged_count, 0);
    }

    #[test]
    fn test_diff_added_removed() {
        let doc_id = Uuid::new_v4();
        let c1 = Uuid::new_v4();
        let c2 = Uuid::new_v4();
        let v1 = make_version(doc_id, 1, vec![make_clause(c1, "Old Clause", "h1")]);
        let v2 = make_version(doc_id, 2, vec![make_clause(c2, "New Clause", "h2")]);
        let diff = diff_versions(&v1, &v2);
        assert_eq!(diff.added_count, 1);
        assert_eq!(diff.removed_count, 1);
        assert_eq!(diff.modified_count, 0);
    }

    #[test]
    fn test_version_store_round_trip() {
        let store = VersionStore::open(":memory:").unwrap();
        let doc_id = Uuid::new_v4();
        let cid = Uuid::new_v4();

        let mut clause = make_clause(cid, "Confidentiality", "deadbeef");
        clause.role = Some(ClauseRole::Prohibition);
        clause.domain = Some(ClauseDomain::Confidentiality);

        let version = make_version(doc_id, 1, vec![clause]);
        let vid = version.id;

        store.save_version(&version).unwrap();
        let loaded = store.load_version(vid).unwrap();

        assert_eq!(loaded.id, vid);
        assert_eq!(loaded.document_id, doc_id);
        assert_eq!(loaded.version_number, 1);
        assert_eq!(loaded.state, NegotiationState::Draft);
        assert_eq!(loaded.clauses.len(), 1);
        assert_eq!(loaded.clauses[0].title, "Confidentiality");
    }

    #[test]
    fn test_version_store_history_and_diff() {
        let store = VersionStore::open(":memory:").unwrap();
        let doc_id = Uuid::new_v4();
        let cid = Uuid::new_v4();

        let v1 = make_version(doc_id, 1, vec![make_clause(cid, "Payment", "hash_a")]);
        let v2 = make_version(doc_id, 2, vec![make_clause(cid, "Payment", "hash_b")]);
        let (v1_id, v2_id) = (v1.id, v2.id);

        store.save_version(&v1).unwrap();
        store.save_version(&v2).unwrap();

        let history = store.get_history(doc_id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].version_number, 1);
        assert_eq!(history[1].version_number, 2);

        let diff = store.diff_by_ids(v1_id, v2_id).unwrap();
        assert_eq!(diff.modified_count, 1);
    }

    #[test]
    fn test_next_version_number() {
        let store = VersionStore::open(":memory:").unwrap();
        let doc_id = Uuid::new_v4();
        assert_eq!(store.next_version_number(doc_id).unwrap(), 1);

        let v1 = make_version(doc_id, 1, vec![]);
        store.save_version(&v1).unwrap();
        assert_eq!(store.next_version_number(doc_id).unwrap(), 2);
    }

    #[test]
    fn test_flat_clauses_includes_children() {
        let doc_id = Uuid::new_v4();
        let parent_id = Uuid::new_v4();
        let child_id = Uuid::new_v4();
        let mut parent = make_clause(parent_id, "Parent", "hp");
        parent.children.push(make_clause(child_id, "Child", "hc"));
        let version = make_version(doc_id, 1, vec![parent]);
        let flat = version.flat_clauses();
        assert!(flat.contains_key(&parent_id));
        assert!(flat.contains_key(&child_id));
    }
}
