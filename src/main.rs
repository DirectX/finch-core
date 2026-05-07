use std::{path::PathBuf, sync::{Arc, Mutex}};

use pandoc_ast::Block;

use finch_core::clause_parser::build_clauses;
use finch_core::classifier::{ClassificationCache, Classifier};
use finch_core::docx_renderer::DocxRenderer;
use finch_core::llm::{LlmClient, LlmConfig};
use finch_core::typst_renderer::{TypstRenderer, TypstRenderOptions};

#[tokio::main]
async fn main() {
    let mut p = pandoc::new();

    p.add_input("./docs/sample.md");
    p.set_output(pandoc::OutputKind::File(PathBuf::from("./docs/output.txt")));

    let blocks = Arc::new(Mutex::new(Vec::<Block>::new()));
    let blocks_for_filter = Arc::clone(&blocks);

    p.add_filter(move |json| {
        let blocks_for_filter = Arc::clone(&blocks_for_filter);
        pandoc_ast::filter(json, |pandoc| {
            for block in &pandoc.blocks {
                blocks_for_filter.lock().unwrap().push(block.clone());
            }
            pandoc
        })
    });
    p.execute().unwrap();

    let mut clauses = build_clauses(blocks.lock().unwrap().clone());
    println!("Parsed {} top-level clause(s)\n", clauses.len());
    print_clauses(&clauses, 0);

    let config = LlmConfig::default();
    println!("\nClassifying with LLM at {} ...\n", config.base_url);

    let cache = match ClassificationCache::open("./docs/classification_cache.db") {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open cache DB: {e}");
            return;
        }
    };

    let client = LlmClient::new(config);
    let classifier = Classifier::new(client, cache);

    let results_vec = classifier.classify_tree(&mut clauses).await;

    println!("\n--- Classification Results ---");
    for (id, cr) in &results_vec {
        println!(
            "Clause {id}\n  role={:?}  domain={:?}  risk={}/5\n  tags={:?}\n  parties={:?}\n  summary={:?}\n",
            cr.role, cr.domain, cr.risk_score, cr.tags, cr.parties, cr.summary
        );
    }

    let results: std::collections::HashMap<uuid::Uuid, finch_core::classifier::ClassificationResult> =
        results_vec
            .into_iter()
            .filter_map(|(id_str, cr)| uuid::Uuid::parse_str(&id_str).ok().map(|id| (id, cr)))
            .collect();

    let json = serde_json::to_string_pretty(&clauses).unwrap();
    std::fs::write("./docs/clauses.json", &json).unwrap();
    println!("Clause tree written to ./docs/clauses.json");

    let docx_path = PathBuf::from("./docs/output.docx");
    match DocxRenderer::render_clean(&clauses, "Service Agreement", &docx_path) {
        Ok(()) => println!("DOCX written to {}", docx_path.display()),
        Err(e) => eprintln!("DOCX render failed: {e}"),
    }

    let typ_opts = TypstRenderOptions {
        title: "Service Agreement".into(),
        author: Some("finch-core".into()),
        date: None,
        show_risk_scores: true,
        show_role_badges: true,
    };
    let pdf_path = PathBuf::from("./docs/output.pdf");
    match TypstRenderer::render_pdf(&clauses, &results, &pdf_path, &typ_opts) {
        Ok(()) => println!("PDF written to {}", pdf_path.display()),
        Err(e) => eprintln!("PDF render skipped: {e}"),
    }
}

fn print_clauses(clauses: &[finch_core::clause_parser::Clause], depth: usize) {
    for c in clauses {
        let indent = "  ".repeat(depth);
        println!(
            "{}[L{}] {:?} | {:?} | primary={:?} | {}",
            indent, c.level,
            c.role, c.domain, c.primary_role,
            if c.title.is_empty() { "<no title>" } else { &c.title }
        );
        print_clauses(&c.children, depth + 1);
    }
}