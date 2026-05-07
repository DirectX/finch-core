use std::{path::PathBuf, sync::{Arc, Mutex}};

use pandoc_ast::Block;

use crate::clause_parser::build_clauses;
use crate::classifier::{ClassificationCache, Classifier};
use crate::llm::{LlmClient, LlmConfig};

pub mod clause_parser;
pub mod classifier;
pub mod llm;

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

    let results = classifier.classify_tree(&mut clauses).await;

    println!("\n--- Classification Results ---");
    for (id, cr) in &results {
        println!(
            "Clause {id}\n  role={:?}  domain={:?}  risk={}/5\n  tags={:?}\n  parties={:?}\n  summary={:?}\n",
            cr.role, cr.domain, cr.risk_score, cr.tags, cr.parties, cr.summary
        );
    }

    let json = serde_json::to_string_pretty(&clauses).unwrap();
    std::fs::write("./docs/clauses.json", &json).unwrap();
    println!("Clause tree written to ./docs/clauses.json");
}

fn print_clauses(clauses: &[clause_parser::Clause], depth: usize) {
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
