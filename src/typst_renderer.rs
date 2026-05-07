use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

use anyhow::{anyhow, Result};
use uuid::Uuid;

use crate::clause_parser::{Clause, ClauseRole};
use crate::classifier::ClassificationResult;

#[derive(Debug, Clone)]
pub struct TypstRenderOptions {
    pub title: String,
    pub author: Option<String>,
    pub date: Option<String>,
    pub show_risk_scores: bool,
    pub show_role_badges: bool,
}

impl Default for TypstRenderOptions {
    fn default() -> Self {
        Self {
            title: "Legal Document".into(),
            author: None,
            date: None,
            show_risk_scores: true,
            show_role_badges: true,
        }
    }
}

pub struct TypstRenderer;

impl TypstRenderer {
    pub fn render_typ(
        clauses: &[Clause],
        results: &HashMap<Uuid, ClassificationResult>,
        opts: &TypstRenderOptions,
    ) -> String {
        let date_str = opts
            .date
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().format("%B %d, %Y").to_string());
        let author_str = opts.author.as_deref().unwrap_or("");
        let author_line = if author_str.is_empty() {
            String::new()
        } else {
            format!(
                "  #v(0.2em)\n  #text(size: 10pt)[{}]",
                escape_typst(author_str)
            )
        };

        let mut out = format!(
            r###"#set document(title: "{title}", author: "{author}")
#set page(paper: "a4", margin: (left: 2.5cm, right: 2.5cm, top: 3cm, bottom: 2.5cm), numbering: "1")
#set text(font: ("Liberation Serif", "Times New Roman", "Libertinus Serif"), size: 11pt, lang: "en")
#set par(justify: true, leading: 0.65em)
#set heading(numbering: none)

#let _rbadge(label, c) = box(
  fill: c.lighten(85%),
  stroke: 0.5pt + c,
  inset: (x: 4pt, y: 2pt),
  radius: 3pt,
)[#text(fill: c, size: 7.5pt, weight: "bold")[#label]]

#align(center)[
  #text(size: 16pt, weight: "bold")[{title}]
{author_line}
  #v(0.3em)
  #text(size: 9pt, fill: luma(120))[{date}]
]
#v(0.8em)
#line(length: 100%, stroke: 0.4pt + luma(160))
#v(1.2em)

"###,
            title = escape_typst(&opts.title),
            author = escape_typst(author_str),
            author_line = author_line,
            date = escape_typst(&date_str),
        );

        for clause in clauses {
            render_clause_into(&mut out, clause, results, opts);
        }

        out
    }

    pub fn render_pdf(
        clauses: &[Clause],
        results: &HashMap<Uuid, ClassificationResult>,
        output_path: &Path,
        opts: &TypstRenderOptions,
    ) -> Result<()> {
        let typ_source = Self::render_typ(clauses, results, opts);
        let tmp_typ = output_path.with_extension("typ");
        std::fs::write(&tmp_typ, &typ_source)?;

        let status = Command::new("typst")
            .arg("compile")
            .arg(&tmp_typ)
            .arg(output_path)
            .status()
            .map_err(|e| anyhow!(
                "failed to launch `typst`: {e}\nInstall from https://typst.app or `cargo install typst-cli`"
            ))?;

        if !status.success() {
            return Err(anyhow!(
                "typst compile failed (exit {:?}); check {}",
                status.code(),
                tmp_typ.display()
            ));
        }
        Ok(())
    }
}

fn render_clause_into(
    out: &mut String,
    clause: &Clause,
    results: &HashMap<Uuid, ClassificationResult>,
    opts: &TypstRenderOptions,
) {
    let level = clause.level.clamp(1, 6) as usize;
    out.push_str(&format!("{} {}\n", "=".repeat(level), escape_typst(&clause.title)));

    if let Some(cr) = results.get(&clause.id) {
        let mut badges: Vec<String> = Vec::new();

        if opts.show_role_badges {
            if let Some(ref role) = cr.role {
                let (label, color) = match role {
                    ClauseRole::Prohibition => ("Prohibition", "rgb(\"#c0392b\")"),
                    ClauseRole::Obligation  => ("Obligation",  "rgb(\"#2c3e7f\")"),
                    ClauseRole::Right       => ("Right",       "rgb(\"#27ae60\")"),
                    ClauseRole::Condition   => ("Condition",   "rgb(\"#8e6914\")"),
                };
                badges.push(format!("#_rbadge(\"{label}\", {color})"));
            }
            if let Some(ref domain) = cr.domain {
                badges.push(format!(
                    "#text(size: 7.5pt, fill: luma(110))[{:?}]",
                    domain
                ));
            }
        }

        if opts.show_risk_scores && cr.risk_score >= 3 {
            badges.push(format!(
                "#text(fill: rgb(\"#c0392b\"), size: 8pt)[\u{26a0} Risk {}/5 \u{2014} {}]",
                cr.risk_score,
                escape_typst(&cr.risk_reason)
            ));
        }

        if !badges.is_empty() {
            out.push_str(&format!(
                "#block(below: 4pt)[{}]\n\n",
                badges.join(" #h(6pt) ")
            ));
        }

        if let Some(ref summary) = cr.summary {
            out.push_str(&format!(
                "#block(fill: luma(245), inset: (x: 8pt, y: 5pt), radius: 3pt, width: 100%)[#text(size: 9pt, style: \"italic\")[{}]]\n\n",
                escape_typst(summary)
            ));
        }
    }

    let body = clause.body_text();
    if !body.is_empty() {
        out.push_str(&escape_typst(&body));
        out.push_str("\n\n");
    }

    for child in &clause.children {
        render_clause_into(out, child, results, opts);
    }
}

fn escape_typst(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '#'  => out.push_str("\\#"),
            '@'  => out.push_str("\\@"),
            '<'  => out.push_str("\\<"),
            '>'  => out.push_str("\\>"),
            '`'  => out.push_str("\\`"),
            '$'  => out.push_str("\\$"),
            _    => out.push(ch),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classifier::{ClassificationResult, ClauseEntities};
    use crate::clause_parser::ClauseRole;

    fn make_clause(id: Uuid, title: &str, level: i32) -> Clause {
        Clause {
            id,
            content_hash: "abc".into(),
            role: None,
            domain: None,
            aggregated_roles: vec![],
            aggregated_domains: vec![],
            primary_role: None,
            tags: vec![],
            level,
            title: title.to_string(),
            number: None,
            content: vec![],
            children: vec![],
        }
    }

    #[test]
    fn test_render_typ_contains_title_and_section() {
        let clause = make_clause(Uuid::new_v4(), "Payment Terms", 2);
        let opts = TypstRenderOptions {
            title: "Service Agreement".into(),
            ..Default::default()
        };
        let out = TypstRenderer::render_typ(&[clause], &HashMap::new(), &opts);
        assert!(out.contains("Service Agreement"), "document title missing");
        assert!(out.contains("Payment Terms"), "clause title missing");
        assert!(out.contains("#set page"), "preamble missing");
    }

    #[test]
    fn test_render_typ_heading_level() {
        let mut clause = make_clause(Uuid::new_v4(), "Definitions", 1);
        clause.level = 1;
        let out = TypstRenderer::render_typ(&[clause], &HashMap::new(), &Default::default());
        assert!(out.contains("= Definitions"), "level-1 heading should be '= Title'");
    }

    #[test]
    fn test_render_typ_nested_headings() {
        let child = make_clause(Uuid::new_v4(), "Sub-clause", 3);
        let mut parent = make_clause(Uuid::new_v4(), "Parent", 2);
        parent.children.push(child);
        let out = TypstRenderer::render_typ(&[parent], &HashMap::new(), &Default::default());
        assert!(out.contains("== Parent"));
        assert!(out.contains("=== Sub-clause"));
    }

    #[test]
    fn test_escape_typst_special_chars() {
        assert_eq!(escape_typst("a#b@c<d>e$f`g"), r"a\#b\@c\<d\>e\$f\`g");
        assert_eq!(escape_typst("plain text"), "plain text");
        assert_eq!(escape_typst(r"\backslash"), r"\\backslash");
    }

    #[test]
    fn test_render_typ_risk_annotation() {
        let id = Uuid::new_v4();
        let clause = make_clause(id, "Liability Cap", 2);
        let mut results = HashMap::new();
        results.insert(
            id,
            ClassificationResult {
                role: Some(ClauseRole::Prohibition),
                domain: None,
                tags: vec![],
                risk_score: 4,
                risk_reason: "Unusually low cap".into(),
                parties: vec![],
                entities: ClauseEntities::default(),
                summary: Some("Caps liability at \\$100".into()),
            },
        );
        let opts = TypstRenderOptions {
            show_risk_scores: true,
            show_role_badges: true,
            ..Default::default()
        };
        let out = TypstRenderer::render_typ(&[clause], &results, &opts);
        assert!(out.contains("4/5"), "risk score missing");
        assert!(out.contains("Prohibition"), "role badge missing");
    }

    #[test]
    fn test_render_typ_no_risk_below_threshold() {
        let id = Uuid::new_v4();
        let clause = make_clause(id, "Routine Clause", 2);
        let mut results = HashMap::new();
        results.insert(
            id,
            ClassificationResult {
                role: None,
                domain: None,
                tags: vec![],
                risk_score: 2,
                risk_reason: "standard".into(),
                parties: vec![],
                entities: ClauseEntities::default(),
                summary: None,
            },
        );
        let opts = TypstRenderOptions {
            show_risk_scores: true,
            ..Default::default()
        };
        let out = TypstRenderer::render_typ(&[clause], &results, &opts);
        assert!(!out.contains("Risk 2/5"), "low-risk annotation should not appear");
    }
}
