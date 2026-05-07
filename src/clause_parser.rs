use pandoc_ast::{Block, Inline};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ClauseRole {
    Obligation,
    Right,
    Condition,
    Prohibition,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum ClauseDomain {
    Payment,
    Liability,
    Termination,
    Confidentiality,
    Definition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Clause {
    pub id: Uuid,
    pub content_hash: String,

    pub role: Option<ClauseRole>,
    pub domain: Option<ClauseDomain>,

    pub aggregated_roles: Vec<ClauseRole>,
    pub aggregated_domains: Vec<ClauseDomain>,

    pub primary_role: Option<ClauseRole>,

    pub tags: Vec<String>,
    pub level: i32,
    pub title: String,
    pub number: Option<Vec<String>>,

    #[serde(skip)]
    pub content: Vec<Block>,

    pub children: Vec<Clause>,
}

impl Clause {
    pub fn full_text(&self) -> String {
        let mut parts = vec![self.title.clone()];
        for block in &self.content {
            parts.push(block_to_text(block));
        }
        for child in &self.children {
            parts.push(child.full_text());
        }
        parts.join(" ")
    }

    pub fn own_text(&self) -> String {
        let mut parts = vec![self.title.clone()];
        for block in &self.content {
            parts.push(block_to_text(block));
        }
        parts.join(" ")
    }
}

fn block_to_text(block: &Block) -> String {
    match block {
        Block::Para(inlines) | Block::Plain(inlines) => inline_to_text(inlines),
        Block::BlockQuote(blocks) => blocks.iter().map(block_to_text).collect::<Vec<_>>().join(" "),
        Block::BulletList(items) | Block::OrderedList(_, items) => items
            .iter()
            .flat_map(|item| item.iter().map(block_to_text))
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

fn compute_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn detect_clause_type(text: &str) -> (Option<ClauseRole>, Option<ClauseDomain>) {
    let t = text.to_lowercase();

    let role = if t.contains("shall not") || t.contains("must not") || t.contains("prohibited") {
        Some(ClauseRole::Prohibition)
    } else if t.contains("shall") || t.contains("must") || t.contains("will") && !t.contains("at will") {
        Some(ClauseRole::Obligation)
    } else if t.contains(" may ") || t.contains("is entitled") || t.contains("has the right") {
        Some(ClauseRole::Right)
    } else if t.contains("if ") || t.contains("provided that") || t.contains("in the event") || t.contains("subject to") {
        Some(ClauseRole::Condition)
    } else {
        None
    };

    let domain = if t.contains("pay") || t.contains("payment") || t.contains("invoice") || t.contains("fee") || t.contains("price") {
        Some(ClauseDomain::Payment)
    } else if t.contains("liable") || t.contains("liability") || t.contains("damages") || t.contains("indemnif") || t.contains("loss") {
        Some(ClauseDomain::Liability)
    } else if t.contains("terminat") || t.contains("expir") || t.contains("cancel") || t.contains("end of") {
        Some(ClauseDomain::Termination)
    } else if t.contains("confidential") || t.contains("disclose") || t.contains("nda") || t.contains("proprietary") || t.contains("secret") {
        Some(ClauseDomain::Confidentiality)
    } else if (t.contains("means") || t.contains('"') || t.contains("defined as") || t.contains("refers to")) && (t.len() < 400) {
        Some(ClauseDomain::Definition)
    } else {
        None
    };

    (role, domain)
}

pub fn aggregate(clause: &mut Clause) {
    let mut roles: Vec<ClauseRole> = Vec::new();
    let mut domains: Vec<ClauseDomain> = Vec::new();

    if let Some(r) = &clause.role {
        roles.push(r.clone());
    }
    if let Some(d) = &clause.domain {
        domains.push(d.clone());
    }

    for child in &mut clause.children {
        aggregate(child);
        roles.extend(child.aggregated_roles.clone());
        domains.extend(child.aggregated_domains.clone());
    }

    roles.sort();
    roles.dedup();
    domains.sort();
    domains.dedup();

    clause.primary_role = derive_primary_role(&roles);
    clause.aggregated_roles = roles;
    clause.aggregated_domains = domains;
}

fn derive_primary_role(roles: &[ClauseRole]) -> Option<ClauseRole> {
    let priority = [
        ClauseRole::Prohibition,
        ClauseRole::Obligation,
        ClauseRole::Right,
        ClauseRole::Condition,
    ];
    for candidate in &priority {
        if roles.contains(candidate) {
            return Some(candidate.clone());
        }
    }
    None
}

pub fn inline_to_text(inlines: &[Inline]) -> String {
    let mut result = String::new();

    for inline in inlines {
        match inline {
            Inline::Str(s) => result.push_str(s),
            Inline::Space => result.push(' '),
            Inline::SoftBreak | Inline::LineBreak => result.push(' '),
            Inline::Code(_, s) => result.push_str(s),
            Inline::Emph(inner)
            | Inline::Strong(inner)
            | Inline::Underline(inner)
            | Inline::Strikeout(inner)
            | Inline::Superscript(inner)
            | Inline::Subscript(inner)
            | Inline::SmallCaps(inner) => {
                result.push_str(&inline_to_text(inner));
            }
            Inline::Link(_, inner, _) => result.push_str(&inline_to_text(inner)),
            Inline::Image(_, inner, _) => result.push_str(&inline_to_text(inner)),
            _ => {}
        }
    }

    result.trim().to_string()
}

pub fn extract_number(title: &str) -> (Option<Vec<String>>, String) {
    let re = Regex::new(r"^((\d+|[a-zA-Z])([.)](\d+|[a-zA-Z]))*)([.)])?\s+").unwrap();

    if let Some(caps) = re.captures(title) {
        let full_match = caps.get(0).unwrap().as_str();
        let number_part = caps.get(1).unwrap().as_str();

        let parts = number_part
            .split(|c| c == '.' || c == ')')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect::<Vec<_>>();

        let rest = title[full_match.len()..].trim().to_string();
        return (Some(parts), rest);
    }

    (None, title.to_string())
}

fn make_clause(level: i32, title: String, number: Option<Vec<String>>, content: Vec<Block>) -> Clause {
    let (role, domain) = detect_clause_type(&title);
    let hash_input = format!("{}{}", title, content.iter().map(block_to_text).collect::<Vec<_>>().join(" "));
    let content_hash = compute_hash(&hash_input);

    Clause {
        id: Uuid::new_v4(),
        content_hash,
        role,
        domain,
        aggregated_roles: vec![],
        aggregated_domains: vec![],
        primary_role: None,
        tags: vec![],
        level,
        title,
        number,
        content,
        children: vec![],
    }
}

pub fn build_clauses(blocks: Vec<Block>) -> Vec<Clause> {
    let mut root: Vec<Clause> = Vec::new();
    let mut stack: Vec<Clause> = Vec::new();

    for block in blocks {
        match block {
            Block::Header(level, _, inlines) => {
                let raw_title = inline_to_text(&inlines);
                let (number, clean_title) = extract_number(&raw_title);

                let new_clause = make_clause(level as i32, clean_title, number, Vec::new());

                while let Some(top) = stack.last() {
                    if top.level < level as i32 {
                        break;
                    }
                    let finished = stack.pop().unwrap();
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(finished);
                    } else {
                        root.push(finished);
                    }
                }

                stack.push(new_clause);
            }

            Block::Para(inlines) => {
                let text = inline_to_text(&inlines);
                if let Some(current) = stack.last_mut() {
                    let (role, domain) = detect_clause_type(&text);
                    if current.role.is_none() {
                        current.role = role;
                    }
                    if current.domain.is_none() {
                        current.domain = domain;
                    }
                    let hash_input = format!("{}{}", current.title, text);
                    current.content_hash = compute_hash(&hash_input);
                    current.content.push(Block::Para(inlines));
                } else {
                    root.push(make_clause(0, text, None, vec![Block::Para(inlines)]));
                }
            }

            other => {
                if let Some(current) = stack.last_mut() {
                    current.content.push(other);
                } else {
                    root.push(make_clause(0, String::new(), None, vec![other]));
                }
            }
        }
    }

    while let Some(clause) = stack.pop() {
        if let Some(parent) = stack.last_mut() {
            parent.children.push(clause);
        } else {
            root.push(clause);
        }
    }

    for clause in &mut root {
        aggregate(clause);
    }

    root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_number_dotted() {
        let (num, title) = extract_number("1.2.3 Payment Terms");
        assert_eq!(num, Some(vec!["1".into(), "2".into(), "3".into()]));
        assert_eq!(title, "Payment Terms");
    }

    #[test]
    fn test_extract_number_paren() {
        let (num, title) = extract_number("a) Definitions");
        assert_eq!(num, Some(vec!["a".into()]));
        assert_eq!(title, "Definitions");
    }

    #[test]
    fn test_extract_number_none() {
        let (num, title) = extract_number("General Provisions");
        assert_eq!(num, None);
        assert_eq!(title, "General Provisions");
    }

    #[test]
    fn test_detect_prohibition() {
        let (role, _) = detect_clause_type("The Buyer shall not disclose any information.");
        assert_eq!(role, Some(ClauseRole::Prohibition));
    }

    #[test]
    fn test_detect_obligation() {
        let (role, _) = detect_clause_type("The Seller shall deliver goods within 30 days.");
        assert_eq!(role, Some(ClauseRole::Obligation));
    }

    #[test]
    fn test_detect_right() {
        let (role, _) = detect_clause_type("The Licensee may sublicense the software.");
        assert_eq!(role, Some(ClauseRole::Right));
    }

    #[test]
    fn test_detect_payment_domain() {
        let (_, domain) = detect_clause_type("All invoices shall be paid within 30 days.");
        assert_eq!(domain, Some(ClauseDomain::Payment));
    }

    #[test]
    fn test_detect_confidentiality_domain() {
        let (_, domain) = detect_clause_type("Neither party shall disclose confidential information.");
        assert_eq!(domain, Some(ClauseDomain::Confidentiality));
    }

    #[test]
    fn test_clause_has_id_and_hash() {
        let c = make_clause(1, "Payment".into(), None, vec![]);
        assert!(!c.content_hash.is_empty());
        assert_ne!(c.id, Uuid::nil());
    }

    #[test]
    fn test_para_attaches_to_parent_clause() {
        use pandoc_ast::{Attr, Block, Inline};
        let attr: Attr = ("".into(), vec![], vec![]);
        let blocks = vec![
            Block::Header(1, attr.clone(), vec![Inline::Str("Confidentiality".into())]),
            Block::Para(vec![Inline::Str("Parties shall not disclose.".into())]),
        ];
        let clauses = build_clauses(blocks);
        assert_eq!(clauses.len(), 1);
        assert_eq!(clauses[0].title, "Confidentiality");
        assert_eq!(clauses[0].content.len(), 1);
    }

    #[test]
    fn test_aggregate_primary_role_prohibition_wins() {
        use pandoc_ast::{Attr, Block, Inline};
        let attr: Attr = ("".into(), vec![], vec![]);
        let blocks = vec![
            Block::Header(1, attr.clone(), vec![Inline::Str("Terms".into())]),
            Block::Header(2, attr.clone(), vec![Inline::Str("Sub".into())]),
            Block::Para(vec![Inline::Str("Buyer shall not pay late fees.".into())]),
        ];
        let clauses = build_clauses(blocks);
        assert_eq!(clauses[0].primary_role, Some(ClauseRole::Prohibition));
    }

    #[test]
    fn test_serde_round_trip() {
        let c = make_clause(1, "Liability".into(), Some(vec!["3".into(), "1".into()]), vec![]);
        let json = serde_json::to_string(&c).unwrap();
        let back: Clause = serde_json::from_str(&json).unwrap();
        assert_eq!(c.id, back.id);
        assert_eq!(c.title, back.title);
        assert_eq!(c.number, back.number);
        assert_eq!(c.content_hash, back.content_hash);
    }
}
