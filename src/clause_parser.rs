use pandoc_ast::{Block, Inline};
use regex::Regex;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ClauseRole {
    Obligation,
    Right,
    Condition,
    Prohibition,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum ClauseDomain {
    Payment,
    Liability,
    Termination,
    Confidentiality,
    Definition,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Clause {
    // --- leaf semantics ---
    pub role: Option<ClauseRole>,
    pub domain: Option<ClauseDomain>,

    // --- aggregation ---
    pub aggregated_roles: Vec<ClauseRole>,
    pub aggregated_domains: Vec<ClauseDomain>,

    // --- derived ---
    pub primary_role: Option<ClauseRole>,

    // --- the rest ---
    pub tags: Vec<String>,
    pub level: i32,
    pub title: String,
    pub number: Option<Vec<String>>,
    pub content: Vec<Block>,
    pub children: Vec<Clause>,
}

fn detect_clause_type(text: &str) -> (Option<ClauseRole>, Option<ClauseDomain>) {
    let t = text.to_lowercase();

    let mut role: Option<ClauseRole> = None;
    let mut domain: Option<ClauseDomain> = None;

    if t.contains("shall not") {
        role = Some(ClauseRole::Prohibition);
    }

    if t.contains("pay") || t.contains("payment") {
        domain = Some(ClauseDomain::Payment);
    }

    // if t.contains("shall not") {
    //     ClauseType::Prohibition
    // } else if t.contains("shall") || t.contains("must") {
    //     ClauseType::Obligation
    // } else if t.contains("may") {
    //     ClauseType::Right
    // } else if t.contains("if") || t.contains("provided that") {
    //     ClauseType::Condition
    // } else if t.contains("means") && t.contains('"') {
    //     ClauseType::Definition
    // } else if t.contains("pay") || t.contains("payment") {
    //     ClauseType::Payment
    // } else {
    //     ClauseType::Text
    // }

    (role, domain)
}

fn aggregate(clause: &mut Clause) {
    let mut roles = Vec::new();
    let mut domains = Vec::new();

    // взять своё
    if let Some(r) = &clause.role {
        roles.push(r.clone());
    }

    if let Some(d) = &clause.domain {
        domains.push(d.clone());
    }

    // собрать из детей
    for child in &mut clause.children {
        aggregate(child);

        roles.extend(child.aggregated_roles.clone());
        domains.extend(child.aggregated_domains.clone());
    }

    // убрать дубликаты
    roles.sort();
    roles.dedup();

    domains.sort();
    domains.dedup();

    clause.aggregated_roles = roles;
    clause.aggregated_domains = domains;
}

fn inline_to_text(inlines: &[Inline]) -> String {
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

            Inline::Link(_, inner, _) => {
                result.push_str(&inline_to_text(inner));
            }

            Inline::Image(_, inner, _) => {
                result.push_str(&inline_to_text(inner));
            }

            _ => {}
        }
    }

    result.trim().to_string()
}

fn extract_number(title: &str) -> (Option<Vec<String>>, String) {
    // supports:
    // 1.
    // 1.2.3
    // 1)
    // a)
    // A.
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

pub fn build_clauses(blocks: Vec<Block>) -> Vec<Clause> {
    let mut root: Vec<Clause> = Vec::new();
    let mut stack: Vec<Clause> = Vec::new();

    for block in blocks {
        match block {
            Block::Header(level, _, inlines) => {
                let raw_title = inline_to_text(&inlines);
                let (number, clean_title) = extract_number(&raw_title);
                let (role, domain) = detect_clause_type(&clean_title);

                let new_clause = Clause {
                    role,
                    domain,
                    aggregated_roles: vec![],
                    aggregated_domains: vec![],
                    primary_role: None,
                    tags: vec![],
                    level: level as i32,
                    title: clean_title,
                    number,
                    content: Vec::new(),
                    children: Vec::new(),
                };

                // стек
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

            other => {
                if let Some(current) = stack.last_mut() {
                    current.content.push(other);
                } else {
                    root.push(Clause {
                        role: None,
                        domain: None,
                        aggregated_roles: vec![],
                        aggregated_domains: vec![],
                        primary_role: None,
                        tags: vec![],
                        level: 0,
                        title: "".into(),
                        number: None,
                        content: vec![other],
                        children: vec![],
                    });
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

    root
}
