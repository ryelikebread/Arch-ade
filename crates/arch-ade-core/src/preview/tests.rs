use std::io::Write;

use super::*;

fn ctx_parts() -> (Db, Tools) {
    (Db::open_in_memory().unwrap(), Tools::default())
}

fn run(path: &Path) -> Preview {
    let (db, tools) = ctx_parts();
    let ctx = Ctx { db: &db, tools: &tools, platform: crate::platform::current() };
    preview(path, &ctx).unwrap()
}

fn zip_with(path: &Path, files: &[(&str, &str)]) {
    let mut z = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
    for (n, c) in files {
        z.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(c.as_bytes()).unwrap();
    }
    z.finish().unwrap();
}

#[test]
fn text_markdown_json_html() {
    let d = tempfile::tempdir().unwrap();
    for (n, syn) in [("a.txt", "plain"), ("b.md", "markdown"), ("c.json", "json"), ("d.html", "html")] {
        let p = d.path().join(n);
        std::fs::write(&p, "<script>alert(1)</script> hi").unwrap();
        match run(&p).body {
            Body::Text { syntax, text, .. } => {
                assert_eq!(syntax, syn);
                assert!(text.contains("hi"));
            }
            other => panic!("{n}: {other:?}"),
        }
    }
}

#[test]
fn csv_quotes() {
    let (rows, t) = office::parse_delimited("a,\"b,c\",\"say \"\"hi\"\"\"\r\n1,2,3\n", ',');
    assert!(!t);
    assert_eq!(rows, vec![vec!["a", "b,c", "say \"hi\""], vec!["1", "2", "3"]]);
}

#[test]
fn docx_and_gdoc_and_zip() {
    let d = tempfile::tempdir().unwrap();
    let docx = d.path().join("doc.docx");
    zip_with(
        &docx,
        &[(
            "word/document.xml",
            r#"<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> &amp; world</w:t></w:r></w:p><w:p><w:r><w:t>Two</w:t></w:r></w:p></w:body></w:document>"#,
        )],
    );
    match run(&docx).body {
        Body::Document { paragraphs, .. } => assert_eq!(paragraphs, vec!["Hello\t & world", "Two"]),
        other => panic!("{other:?}"),
    }

    let g = d.path().join("Budget.gsheet");
    std::fs::write(
        &g,
        r#"{"url": "https://docs.google.com/spreadsheets/d/abc", "doc_id": "abc", "email": "me@example.com"}"#,
    )
    .unwrap();
    match run(&g).body {
        Body::Gdoc { title, url, .. } => {
            assert_eq!(title, "Budget");
            assert_eq!(url.as_deref(), Some("https://docs.google.com/spreadsheets/d/abc"));
        }
        other => panic!("{other:?}"),
    }

    let z = d.path().join("a.zip");
    zip_with(&z, &[("x/one.txt", "1"), ("two.txt", "22")]);
    match run(&z).body {
        Body::Archive { entries, total, via, .. } => {
            assert_eq!(total, 2);
            assert_eq!(via, "zip");
            assert_eq!(entries[1].size, Some(2));
        }
        other => panic!("{other:?}"),
    }
}

#[test]
fn installers_and_unknown_never_fail() {
    let d = tempfile::tempdir().unwrap();
    for (n, bytes) in
        [("x.dmg", vec![1u8, 2, 3]), ("x.pkg", vec![0; 10]), ("blob.bin", vec![0, 159, 146, 150]), ("empty", vec![])]
    {
        let p = d.path().join(n);
        std::fs::write(&p, bytes).unwrap();
        assert!(matches!(run(&p).body, Body::MetadataOnly { .. }), "{n}");
    }
    let p = d.path().join("notes.weird");
    std::fs::write(&p, "plain words").unwrap();
    assert!(matches!(run(&p).body, Body::Text { .. }));
}

#[test]
fn corrupt_files_degrade_to_metadata() {
    let d = tempfile::tempdir().unwrap();
    for n in ["bad.docx", "bad.xlsx", "bad.zip", "bad.gdoc", "bad.tiff"] {
        let p = d.path().join(n);
        std::fs::write(&p, "not really").unwrap();
        let pv = run(&p);
        assert!(matches!(pv.body, Body::MetadataOnly { .. }), "{n}: {:?}", pv.body);
    }
}

#[test]
fn images() {
    let d = tempfile::tempdir().unwrap();
    let png = d.path().join("a.png");
    ::image::RgbaImage::from_pixel(4, 3, ::image::Rgba([255, 0, 0, 255])).save(&png).unwrap();
    assert!(matches!(run(&png).body, Body::ImageFile { width: Some(4), height: Some(3), .. }));
    let tif = d.path().join("a.tiff");
    ::image::RgbImage::from_pixel(5, 5, ::image::Rgb([0, 0, 255])).save(&tif).unwrap();
    assert!(matches!(run(&tif).body, Body::ImagePng { width: Some(5), .. }));
}

#[test]
fn seven_zip_listing_parser() {
    let out = "Path = dir\nFolder = +\nSize = 0\n\nPath = dir/file.txt\nFolder = -\nSize = 42\n\n";
    let e = archive::parse_7z_slt(out);
    assert_eq!(e.len(), 2);
    assert!(e[0].is_dir);
    assert_eq!(e[1].size, Some(42));
}
