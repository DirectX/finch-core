use std::path::PathBuf;

use pandoc_ast::Block;

use crate::clause_parser::{Clause, build_clauses};

pub mod clause_parser;

fn main() {
    println!("Hello, world!");

    let mut p = pandoc::new();

    p.add_input("./docs/sample.md");
    p.set_output(pandoc::OutputKind::File(PathBuf::from("./docs/output.txt")));

    // let mut blocks = Vec::<Block>::new();

    p.add_filter(|json| {
        pandoc_ast::filter(json, |mut pandoc| {
            for block in &mut pandoc.blocks {
                println!("block: {:?}", block);
                // blocks.push(block.clone());
            }
            pandoc
        })
    });
    p.execute().unwrap();

    // let clauses = build_clauses(blocks);
    // println!("Clauses: {:?}", clauses);
}
