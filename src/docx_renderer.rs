use std::collections::HashMap;
use std::io::Write;
use std::path::Path;

use anyhow::Result;
use similar::{ChangeTag, TextDiff};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::clause_parser::Clause;
use crate::versioning::{ClauseDiffKind, VersionDiff};

const CONTENT_TYPES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>"#;

const RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

const DOC_RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>"#;

const STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr>
      <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
      <w:sz w:val="22"/><w:szCs w:val="22"/>
    </w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr>
      <w:spacing w:after="120" w:line="240" w:lineRule="auto"/>
      <w:jc w:val="both"/>
    </w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>
  </w:style>
</w:styles>"#;

const SETTINGS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:trackChanges/>
  <w:defaultTabStop w:val="720"/>
</w:settings>"#;

#[derive(Debug, Clone)]
pub struct DocxRenderOptions {
    pub author: String,
    pub date: String,
}

impl Default for DocxRenderOptions {
    fn default() -> Self {
        Self {
            author: "finch-core".into(),
            date: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        }
    }
}

pub struct DocxRenderer;

impl DocxRenderer {
    pub fn render_clean(clauses: &[Clause], title: &str, output_path: &Path) -> Result<()> {
        let mut body = String::new();
        body.push_str(&heading_para(title, 0));
        render_clauses_clean(&mut body, clauses);
        write_docx(output_path, &document_xml(&body))
    }

    pub fn render_redlined(
        diff: &VersionDiff,
        from_clauses: &[Clause],
        to_clauses: &[Clause],
        title: &str,
        output_path: &Path,
        opts: &DocxRenderOptions,
    ) -> Result<()> {
        let diff_map: HashMap<Uuid, ClauseDiffKind> = diff
            .diffs
            .iter()
            .map(|d| (d.clause_id, d.kind.clone()))
            .collect();

        let from_flat = flat_clauses_map(from_clauses);

        let mut id = 1u32;
        let mut body = String::new();
        body.push_str(&heading_para(title, 0));

        render_clauses_redlined(
            &mut body,
            to_clauses,
            &diff_map,
            &from_flat,
            &opts.author,
            &opts.date,
            &mut id,
        );

        let removed: Vec<_> = diff
            .diffs
            .iter()
            .filter(|d| matches!(d.kind, ClauseDiffKind::Removed))
            .collect();

        if !removed.is_empty() {
            body.push_str(&heading_para("Removed Provisions", 1));
            for d in removed {
                if let Some(&clause) = from_flat.get(&d.clause_id) {
                    let rid = id; id += 1;
                    body.push_str(&del_heading_para(
                        &clause.title,
                        clause.level.clamp(1, 6) as u8,
                        &opts.author,
                        &opts.date,
                        rid,
                    ));
                    let b = clause.body_text();
                    if !b.is_empty() {
                        let rid2 = id; id += 1;
                        body.push_str(&del_para(&b, &opts.author, &opts.date, rid2));
                    }
                }
            }
        }

        write_docx(output_path, &document_xml(&body))
    }
}

fn render_clauses_clean(out: &mut String, clauses: &[Clause]) {
    for clause in clauses {
        out.push_str(&heading_para(&clause.title, clause.level.clamp(1, 6) as u8));
        let body = clause.body_text();
        if !body.is_empty() {
            out.push_str(&normal_para(&body));
        }
        render_clauses_clean(out, &clause.children);
    }
}

fn render_clauses_redlined(
    out: &mut String,
    clauses: &[Clause],
    diff_map: &HashMap<Uuid, ClauseDiffKind>,
    from_flat: &HashMap<Uuid, &Clause>,
    author: &str,
    date: &str,
    id: &mut u32,
) {
    for clause in clauses {
        let level = clause.level.clamp(1, 6) as u8;
        match diff_map.get(&clause.id) {
            Some(ClauseDiffKind::Added) => {
                let rid = *id; *id += 1;
                out.push_str(&ins_heading_para(&clause.title, level, author, date, rid));
                let body = clause.body_text();
                if !body.is_empty() {
                    let rid2 = *id; *id += 1;
                    out.push_str(&ins_para(&body, author, date, rid2));
                }
            }
            Some(ClauseDiffKind::Modified { .. }) => {
                out.push_str(&heading_para(&clause.title, level));
                let body_after = clause.body_text();
                let body_before = from_flat
                    .get(&clause.id)
                    .map(|c| c.body_text())
                    .unwrap_or_default();
                if !body_before.is_empty() || !body_after.is_empty() {
                    out.push_str(&word_diff_para(&body_before, &body_after, author, date, id));
                }
            }
            Some(ClauseDiffKind::Removed) => {}
            Some(ClauseDiffKind::Unchanged) | None => {
                out.push_str(&heading_para(&clause.title, level));
                let body = clause.body_text();
                if !body.is_empty() {
                    out.push_str(&normal_para(&body));
                }
            }
        }
        render_clauses_redlined(out, &clause.children, diff_map, from_flat, author, date, id);
    }
}

fn flat_clauses_map(clauses: &[Clause]) -> HashMap<Uuid, &Clause> {
    let mut map = HashMap::new();
    fn collect<'a>(clause: &'a Clause, map: &mut HashMap<Uuid, &'a Clause>) {
        map.insert(clause.id, clause);
        for child in &clause.children {
            collect(child, map);
        }
    }
    for clause in clauses {
        collect(clause, &mut map);
    }
    map
}

fn heading_style(level: u8) -> &'static str {
    match level {
        0 => "Title",
        1 => "Heading1",
        2 => "Heading2",
        _ => "Heading3",
    }
}

fn heading_para(text: &str, level: u8) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{s}"/></w:pPr><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>"#,
        s = heading_style(level),
        t = xml_escape(text),
    )
}

fn normal_para(text: &str) -> String {
    format!(
        r#"<w:p><w:r><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        xml_escape(text)
    )
}

fn ins_heading_para(text: &str, level: u8, author: &str, date: &str, id: u32) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{s}"/></w:pPr><w:ins w:id="{id}" w:author="{a}" w:date="{d}"><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:ins></w:p>"#,
        s = heading_style(level),
        id = id,
        a = xml_escape(author),
        d = xml_escape(date),
        t = xml_escape(text),
    )
}

fn del_heading_para(text: &str, level: u8, author: &str, date: &str, id: u32) -> String {
    format!(
        r#"<w:p><w:pPr><w:pStyle w:val="{s}"/></w:pPr><w:del w:id="{id}" w:author="{a}" w:date="{d}"><w:r><w:delText xml:space="preserve">{t}</w:delText></w:r></w:del></w:p>"#,
        s = heading_style(level),
        id = id,
        a = xml_escape(author),
        d = xml_escape(date),
        t = xml_escape(text),
    )
}

fn ins_para(text: &str, author: &str, date: &str, id: u32) -> String {
    format!(
        r#"<w:p><w:ins w:id="{id}" w:author="{a}" w:date="{d}"><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:ins></w:p>"#,
        id = id,
        a = xml_escape(author),
        d = xml_escape(date),
        t = xml_escape(text),
    )
}

fn del_para(text: &str, author: &str, date: &str, id: u32) -> String {
    format!(
        r#"<w:p><w:del w:id="{id}" w:author="{a}" w:date="{d}"><w:r><w:delText xml:space="preserve">{t}</w:delText></w:r></w:del></w:p>"#,
        id = id,
        a = xml_escape(author),
        d = xml_escape(date),
        t = xml_escape(text),
    )
}

fn word_diff_para(before: &str, after: &str, author: &str, date: &str, id: &mut u32) -> String {
    let diff = TextDiff::from_words(before, after);
    let mut runs = String::new();

    for change in diff.iter_all_changes() {
        let rid = *id; *id += 1;
        match change.tag() {
            ChangeTag::Delete => {
                runs.push_str(&format!(
                    r#"<w:del w:id="{rid}" w:author="{a}" w:date="{d}"><w:r><w:delText xml:space="preserve">{t}</w:delText></w:r></w:del>"#,
                    rid = rid,
                    a = xml_escape(author),
                    d = xml_escape(date),
                    t = xml_escape(change.value()),
                ));
            }
            ChangeTag::Insert => {
                runs.push_str(&format!(
                    r#"<w:ins w:id="{rid}" w:author="{a}" w:date="{d}"><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:ins>"#,
                    rid = rid,
                    a = xml_escape(author),
                    d = xml_escape(date),
                    t = xml_escape(change.value()),
                ));
            }
            ChangeTag::Equal => {
                runs.push_str(&format!(
                    r#"<w:r><w:t xml:space="preserve">{}</w:t></w:r>"#,
                    xml_escape(change.value())
                ));
            }
        }
    }

    format!("<w:p>{runs}</w:p>")
}

fn document_xml(body: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <w:body>
    {body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1800"
               w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>"#
    )
}

fn write_docx(path: &Path, doc_xml: &str) -> Result<()> {
    let file = std::fs::File::create(path)?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    zip.start_file("[Content_Types].xml", opts)?;
    zip.write_all(CONTENT_TYPES_XML.as_bytes())?;

    zip.start_file("_rels/.rels", opts)?;
    zip.write_all(RELS_XML.as_bytes())?;

    zip.start_file("word/document.xml", opts)?;
    zip.write_all(doc_xml.as_bytes())?;

    zip.start_file("word/_rels/document.xml.rels", opts)?;
    zip.write_all(DOC_RELS_XML.as_bytes())?;

    zip.start_file("word/styles.xml", opts)?;
    zip.write_all(STYLES_XML.as_bytes())?;

    zip.start_file("word/settings.xml", opts)?;
    zip.write_all(SETTINGS_XML.as_bytes())?;

    zip.finish()?;
    Ok(())
}

pub fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use crate::versioning::{diff_versions, DocumentVersion, NegotiationState};

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
        DocumentVersion::new(doc_id, vn, vec![], NegotiationState::Draft, "alice", "msg", clauses)
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("a & b < c > d \"e\""), "a &amp; b &lt; c &gt; d &quot;e&quot;");
        assert_eq!(xml_escape("plain"), "plain");
    }

    #[test]
    fn test_word_diff_para_shows_changes() {
        let mut id = 1u32;
        let xml = word_diff_para(
            "shall pay the fee within thirty days",
            "shall pay the fee within sixty days",
            "Alice",
            "2024-01-01T00:00:00Z",
            &mut id,
        );
        assert!(xml.starts_with("<w:p>"));
        assert!(xml.contains("w:del") || xml.contains("w:ins"), "diff should produce del/ins markup");
        assert!(xml.contains("thirty") || xml.contains("sixty"));
    }

    #[test]
    fn test_render_clean_is_valid_zip() {
        let tmp = std::env::temp_dir().join("finch_test_clean.docx");
        let clause = make_clause(Uuid::new_v4(), "Payment Terms", "h1");
        DocxRenderer::render_clean(&[clause], "Test Agreement", &tmp).unwrap();

        let data = std::fs::read(&tmp).unwrap();
        let cursor = std::io::Cursor::new(data);
        let mut zip = zip::read::ZipArchive::new(cursor).unwrap();

        assert!(zip.by_name("word/document.xml").is_ok(), "document.xml missing");
        assert!(zip.by_name("[Content_Types].xml").is_ok(), "content types missing");
        assert!(zip.by_name("word/styles.xml").is_ok(), "styles.xml missing");
        assert!(zip.by_name("word/settings.xml").is_ok(), "settings.xml missing");
    }

    #[test]
    fn test_render_clean_contains_clause_title() {
        let tmp = std::env::temp_dir().join("finch_test_title.docx");
        let clause = make_clause(Uuid::new_v4(), "Confidentiality Obligations", "h1");
        DocxRenderer::render_clean(&[clause], "NDA", &tmp).unwrap();

        let data = std::fs::read(&tmp).unwrap();
        let cursor = std::io::Cursor::new(data);
        let mut zip = zip::read::ZipArchive::new(cursor).unwrap();
        let mut doc = zip.by_name("word/document.xml").unwrap();
        let mut xml = String::new();
        doc.read_to_string(&mut xml).unwrap();

        assert!(xml.contains("Confidentiality Obligations"), "clause title missing from XML");
        assert!(xml.contains("NDA"), "document title missing from XML");
    }

    #[test]
    fn test_render_redlined_contains_ins_and_del() {
        let tmp = std::env::temp_dir().join("finch_test_redlined.docx");
        let doc_id = Uuid::new_v4();
        let cid_old = Uuid::new_v4();
        let cid_new = Uuid::new_v4();

        let v1 = make_version(doc_id, 1, vec![make_clause(cid_old, "Old Payment Clause", "h1")]);
        let v2 = make_version(doc_id, 2, vec![make_clause(cid_new, "New Payment Clause", "h2")]);
        let diff = diff_versions(&v1, &v2);
        let opts = DocxRenderOptions::default();

        DocxRenderer::render_redlined(&diff, &v1.clauses, &v2.clauses, "Agreement v2", &tmp, &opts).unwrap();

        let data = std::fs::read(&tmp).unwrap();
        let cursor = std::io::Cursor::new(data);
        let mut zip = zip::read::ZipArchive::new(cursor).unwrap();
        let mut doc = zip.by_name("word/document.xml").unwrap();
        let mut xml = String::new();
        doc.read_to_string(&mut xml).unwrap();

        assert!(xml.contains("w:ins"), "inserted clause not marked");
        assert!(xml.contains("w:del") || xml.contains("Removed Provisions"), "removed clause not marked");
    }

    #[test]
    fn test_render_redlined_modified_word_diff() {
        use pandoc_ast::{Block, Inline};

        let tmp = std::env::temp_dir().join("finch_test_modified.docx");
        let doc_id = Uuid::new_v4();
        let cid = Uuid::new_v4();

        let make_clause_with_body = |id: Uuid, title: &str, hash: &str, body: &str| -> Clause {
            Clause {
                id,
                content_hash: hash.to_string(),
                role: None, domain: None,
                aggregated_roles: vec![], aggregated_domains: vec![],
                primary_role: None, tags: vec![], level: 2,
                title: title.to_string(), number: None,
                content: vec![Block::Para(vec![Inline::Str(body.into())])],
                children: vec![],
            }
        };

        let v1 = make_version(doc_id, 1, vec![make_clause_with_body(
            cid, "Payment Terms", "h1", "shall pay within thirty days",
        )]);
        let v2 = make_version(doc_id, 2, vec![make_clause_with_body(
            cid, "Payment Terms", "h2", "shall pay within sixty days",
        )]);
        let diff = diff_versions(&v1, &v2);
        let opts = DocxRenderOptions {
            author: "Bob".into(),
            date: "2024-06-01T00:00:00Z".into(),
        };

        DocxRenderer::render_redlined(&diff, &v1.clauses, &v2.clauses, "Agreement", &tmp, &opts).unwrap();

        let data = std::fs::read(&tmp).unwrap();
        let cursor = std::io::Cursor::new(data);
        let mut zip = zip::read::ZipArchive::new(cursor).unwrap();
        let mut doc = zip.by_name("word/document.xml").unwrap();
        let mut xml = String::new();
        doc.read_to_string(&mut xml).unwrap();

        assert!(xml.contains("Bob"), "author missing from tracked-change runs");
        assert!(xml.contains("w:del") || xml.contains("w:ins"), "word-level diff not present");
        assert!(xml.contains("thirty") || xml.contains("sixty"), "diff text missing");
    }

    #[test]
    fn test_settings_has_track_changes() {
        assert!(SETTINGS_XML.contains("<w:trackChanges/>"));
    }
}
