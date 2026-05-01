use std::{path::PathBuf, sync::{Arc, Mutex}};

use pandoc_ast::Block;

use crate::clause_parser::build_clauses;

pub mod clause_parser;

fn main() {
    println!("Hello, world!");

    let mut p = pandoc::new();

    p.add_input("./docs/sample.md");
    p.set_output(pandoc::OutputKind::File(PathBuf::from("./docs/output.txt")));

    let blocks = Arc::new(Mutex::new(Vec::<Block>::new()));
    let blocks_for_filter = Arc::clone(&blocks);

    p.add_filter(move |json| {
        let blocks_for_filter = Arc::clone(&blocks_for_filter);
        pandoc_ast::filter(json, |pandoc| {
            for block in &pandoc.blocks {
                println!("block: {:?}", block);
                blocks_for_filter.lock().unwrap().push(block.clone());
            }
            pandoc
        })
    });
    p.execute().unwrap();

    let clauses = build_clauses(blocks.lock().unwrap().clone());
    println!("Clauses: {:?}", clauses);
}
