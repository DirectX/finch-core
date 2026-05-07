/// cargo run --example export_demo
///
/// Exercises the DOCX and Typst renderers without needing the LLM running.
/// Produces:
///   docs/demo_clean.docx       — clean DOCX from mock clauses
///   docs/demo_redlined.docx    — redlined DOCX with <w:ins>/<w:del> from a two-version diff
///   docs/demo_output.typ       — Typst source (always written)
///   docs/demo_output.pdf       — PDF (only if `typst` is installed)
use std::collections::HashMap;
use std::path::Path;

use finch_core::clause_parser::{Clause, ClauseDomain, ClauseRole};
use finch_core::classifier::{ClassificationResult, ClauseEntities};
use finch_core::docx_renderer::{DocxRenderer, DocxRenderOptions};
use finch_core::typst_renderer::{TypstRenderer, TypstRenderOptions};
use finch_core::versioning::{diff_versions, DocumentVersion, NegotiationState};
use uuid::Uuid;

fn leaf(id: Uuid, title: &str, level: i32, role: ClauseRole, domain: ClauseDomain) -> Clause {
    Clause {
        id,
        content_hash: format!("{:x}", id.as_u128()),
        role: Some(role),
        domain: Some(domain),
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

fn main() {
    std::fs::create_dir_all("docs").unwrap();

    let (clauses_v1, clauses_v2, results) = build_demo_data();

    // ── 1. Clean DOCX ──────────────────────────────────────────────────────────
    let clean_path = Path::new("docs/demo_clean.docx");
    DocxRenderer::render_clean(&clauses_v1, "Service Agreement — v1", clean_path).unwrap();
    println!("Clean DOCX  → {}", clean_path.display());

    // ── 2. Redlined DOCX ───────────────────────────────────────────────────────
    let doc_id = Uuid::new_v4();
    let v1 = DocumentVersion::new(
        doc_id, 1, vec![], NegotiationState::Draft,
        "Alice", "Initial draft", clauses_v1.clone(),
    );
    let v2 = DocumentVersion::new(
        doc_id, 2, vec![v1.id], NegotiationState::Negotiating,
        "Bob", "Counter-proposal", clauses_v2.clone(),
    );
    let diff = diff_versions(&v1, &v2);

    println!(
        "\nDiff summary: +{} ~{} -{} ={} clause(s)",
        diff.added_count, diff.modified_count, diff.removed_count, diff.unchanged_count
    );

    let redline_path = Path::new("docs/demo_redlined.docx");
    let opts = DocxRenderOptions {
        author: "Bob".into(),
        date: "2025-05-07T00:00:00Z".into(),
    };
    DocxRenderer::render_redlined(&diff, &v1.clauses, &v2.clauses, "Service Agreement — redlined", redline_path, &opts).unwrap();
    println!("Redlined DOCX → {}", redline_path.display());

    // ── 3. Typst → PDF ─────────────────────────────────────────────────────────
    let typ_opts = TypstRenderOptions {
        title: "Service Agreement".into(),
        author: Some("finch-core demo".into()),
        date: Some("May 7, 2025".into()),
        show_risk_scores: true,
        show_role_badges: true,
    };

    let typ_src = TypstRenderer::render_typ(&clauses_v1, &results, &typ_opts);
    let typ_path = Path::new("docs/demo_output.typ");
    std::fs::write(typ_path, &typ_src).unwrap();
    println!("Typst source  → {} ({} bytes)", typ_path.display(), typ_src.len());

    let pdf_path = Path::new("docs/demo_output.pdf");
    match TypstRenderer::render_pdf(&clauses_v1, &results, pdf_path, &typ_opts) {
        Ok(()) => println!("PDF           → {}", pdf_path.display()),
        Err(e) => println!("PDF skipped   ({})", e),
    }

    println!("\nDone. Open docs/ to inspect outputs.");
}

fn build_demo_data() -> (Vec<Clause>, Vec<Clause>, HashMap<Uuid, ClassificationResult>) {
    let id_defs       = Uuid::new_v4();
    let id_payment    = Uuid::new_v4();
    let id_invoicing  = Uuid::new_v4();
    let id_late       = Uuid::new_v4();
    let id_conf       = Uuid::new_v4();
    let id_liability  = Uuid::new_v4();
    let id_term       = Uuid::new_v4();

    let invoicing = leaf(id_invoicing, "2.1. Invoicing", 3, ClauseRole::Obligation, ClauseDomain::Payment);
    let late_pay  = leaf(id_late,      "2.2. Late Payment", 3, ClauseRole::Obligation, ClauseDomain::Payment);

    let mut payment = leaf(id_payment, "2. Payment Terms", 2, ClauseRole::Obligation, ClauseDomain::Payment);
    payment.children = vec![invoicing, late_pay];

    let root_v1 = Clause {
        id: Uuid::new_v4(),
        content_hash: "root_v1".into(),
        role: None,
        domain: None,
        aggregated_roles: vec![],
        aggregated_domains: vec![],
        primary_role: None,
        tags: vec![],
        level: 1,
        title: "Service Agreement".into(),
        number: None,
        content: vec![],
        children: vec![
            leaf(id_defs, "1. Definitions", 2, ClauseRole::Condition, ClauseDomain::Definition),
            payment,
            leaf(id_conf, "3. Confidentiality", 2, ClauseRole::Prohibition, ClauseDomain::Confidentiality),
            leaf(id_liability, "4. Limitation of Liability", 2, ClauseRole::Prohibition, ClauseDomain::Liability),
            leaf(id_term, "5. Termination", 2, ClauseRole::Right, ClauseDomain::Termination),
        ],
    };

    // v2: payment clause modified (different hash), confidentiality unchanged,
    //     a new "6. Governing Law" clause added, "5. Termination" removed
    let id_governing = Uuid::new_v4();
    let mut payment_v2 = leaf(id_payment, "2. Payment Terms", 2, ClauseRole::Obligation, ClauseDomain::Payment);
    payment_v2.content_hash = "payment_modified_v2".into();

    let root_v2 = Clause {
        id: Uuid::new_v4(),
        content_hash: "root_v2".into(),
        role: None,
        domain: None,
        aggregated_roles: vec![],
        aggregated_domains: vec![],
        primary_role: None,
        tags: vec![],
        level: 1,
        title: "Service Agreement".into(),
        number: None,
        content: vec![],
        children: vec![
            leaf(id_defs, "1. Definitions", 2, ClauseRole::Condition, ClauseDomain::Definition),
            payment_v2,
            leaf(id_conf, "3. Confidentiality", 2, ClauseRole::Prohibition, ClauseDomain::Confidentiality),
            leaf(id_liability, "4. Limitation of Liability", 2, ClauseRole::Prohibition, ClauseDomain::Liability),
            leaf(id_governing, "6. Governing Law", 2, ClauseRole::Condition, ClauseDomain::Definition),
        ],
    };

    let mut results: HashMap<Uuid, ClassificationResult> = HashMap::new();
    for (id, role, domain, risk, reason, summary) in [
        (id_defs,      ClauseRole::Condition,    ClauseDomain::Definition,      1, "Standard definitions",            "Defines key terms used throughout the agreement."),
        (id_payment,   ClauseRole::Obligation,   ClauseDomain::Payment,         2, "Standard payment clause",         "Client shall pay invoices within 30 days."),
        (id_invoicing, ClauseRole::Obligation,   ClauseDomain::Payment,         2, "Standard invoicing",              "Supplier issues monthly invoices."),
        (id_late,      ClauseRole::Obligation,   ClauseDomain::Payment,         3, "Late interest may be high",       "Interest accrues at 8% p.a. on overdue amounts."),
        (id_conf,      ClauseRole::Prohibition,  ClauseDomain::Confidentiality, 1, "Standard NDA language",           "Parties must keep disclosed information secret."),
        (id_liability, ClauseRole::Prohibition,  ClauseDomain::Liability,       4, "Cap is unusually low",            "Total liability capped at one month's fees."),
        (id_term,      ClauseRole::Right,        ClauseDomain::Termination,     2, "Standard termination for cause",  "Either party may terminate on 30 days written notice."),
    ] {
        results.insert(id, ClassificationResult {
            role: Some(role),
            domain: Some(domain),
            tags: vec![],
            risk_score: risk,
            risk_reason: reason.into(),
            parties: vec!["Supplier".into(), "Client".into()],
            entities: ClauseEntities { dates: vec![], amounts: vec![], governing_law: vec![] },
            summary: Some(summary.into()),
        });
    }

    (vec![root_v1], vec![root_v2], results)
}
