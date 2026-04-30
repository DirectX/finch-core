use pandoc_ast::{Block, Inline};

#[derive(Debug)]
pub struct Clause {
    pub level: i64,
    pub title: Vec<Inline>,
    pub content: Vec<Block>,
    pub children: Vec<Clause>,
}

pub fn build_clauses(blocks: Vec<Block>) -> Vec<Clause> {
    let mut root: Vec<Clause> = Vec::new();
    let mut stack: Vec<Clause> = Vec::new();

    for block in blocks {
        match block {
            Block::Header(level, _, title) => {
                let new_clause = Clause {
                    level,
                    title,
                    content: Vec::new(),
                    children: Vec::new(),
                };

                // поднимаемся по стеку
                while let Some(top) = stack.last() {
                    if top.level < level {
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
                    // текст до первого header
                    root.push(Clause {
                        level: 0,
                        title: vec![],
                        content: vec![other],
                        children: vec![],
                    });
                }
            }
        }
    }

    // закрываем стек
    while let Some(clause) = stack.pop() {
        if let Some(parent) = stack.last_mut() {
            parent.children.push(clause);
        } else {
            root.push(clause);
        }
    }

    root
}
