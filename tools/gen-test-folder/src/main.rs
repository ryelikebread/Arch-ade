//! Creates a sample folder covering every Arch-ade preview type and the
//! awkward cases (duplicates, Unicode names, partial downloads, a project
//! folder, files without extensions).
//!
//! Usage: cargo run -p gen-test-folder -- <output dir>

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn write(dir: &Path, name: &str, bytes: impl AsRef<[u8]>) {
    let p = dir.join(name);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(&p, bytes).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
}

fn create(dir: &Path, name: &str) -> fs::File {
    let p = dir.join(name);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::File::create(p).unwrap()
}

fn save_img(dir: &Path, name: &str, img: &image::RgbImage) {
    let p = dir.join(name);
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    img.save(&p).unwrap_or_else(|e| panic!("{}: {e}", p.display()));
}

fn zip(dir: &Path, name: &str, files: &[(&str, &[u8])]) {
    let mut z = zip::ZipWriter::new(create(dir, name));
    for (n, c) in files {
        z.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
        z.write_all(c).unwrap();
    }
    z.finish().unwrap();
}

/// Original procedural pixel image: a little landscape.
fn picture(w: u32, h: u32, seed: u32) -> image::RgbImage {
    image::RgbImage::from_fn(w, h, |x, y| {
        let horizon = h / 2 + ((x / 6 + seed) % 7) * h / 40;
        if y < horizon {
            image::Rgb([40 + (y * 120 / h) as u8, 30, 90 + (seed * 20 % 100) as u8])
        } else {
            image::Rgb([30, 110 + ((x + y) % 3) as u8 * 10, 60])
        }
    })
}

const DOCX_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>Arch-ade sample document</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Second paragraph with a tab:</w:t></w:r><w:r><w:tab/><w:t>here &amp; there.</w:t></w:r></w:p>
</w:body></w:document>"#;

fn docx(dir: &Path) {
    let ct = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#;
    let rels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>"#;
    zip(
        dir,
        "documents/report.docx",
        &[
            ("[Content_Types].xml", ct.as_bytes()),
            ("_rels/.rels", rels.as_bytes()),
            ("word/document.xml", DOCX_XML.as_bytes()),
        ],
    );
}

fn xlsx(dir: &Path) {
    let ct = r#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>"#;
    let rels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;
    let wb = r#"<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>"#;
    let wbrels = r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#;
    let sheet = r#"<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Cost</t></is></c></row>
<row r="2"><c r="A2" t="inlineStr"><is><t>Joystick</t></is></c><c r="B2"><v>24.5</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Buttons</t></is></c><c r="B3"><v>12</v></c></row>
</sheetData></worksheet>"#;
    zip(
        dir,
        "documents/budget.xlsx",
        &[
            ("[Content_Types].xml", ct.as_bytes()),
            ("_rels/.rels", rels.as_bytes()),
            ("xl/workbook.xml", wb.as_bytes()),
            ("xl/_rels/workbook.xml.rels", wbrels.as_bytes()),
            ("xl/worksheets/sheet1.xml", sheet.as_bytes()),
        ],
    );
}

/// A minimal valid one-page PDF.
fn pdf() -> Vec<u8> {
    let stream = "BT /F1 24 Tf 72 720 Td (Arch-ade sample PDF) Tj ET";
    let objs = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
        format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ];
    let mut out = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![];
    for (i, o) in objs.iter().enumerate() {
        offsets.push(out.len());
        out.extend(format!("{} 0 obj\n{o}\nendobj\n", i + 1).as_bytes());
    }
    let xref = out.len();
    out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).as_bytes());
    for off in offsets {
        out.extend(format!("{off:010} 00000 n \n").as_bytes());
    }
    out.extend(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objs.len() + 1).as_bytes());
    out
}

/// 1 second of a 440 Hz square wave, 8-bit mono.
fn wav() -> Vec<u8> {
    let rate = 8000u32;
    let data: Vec<u8> = (0..rate).map(|i| if (i * 440 * 2 / rate).is_multiple_of(2) { 200 } else { 56 }).collect();
    let mut w = Vec::new();
    w.extend(b"RIFF");
    w.extend((36 + data.len() as u32).to_le_bytes());
    w.extend(b"WAVEfmt ");
    w.extend(16u32.to_le_bytes());
    w.extend(1u16.to_le_bytes()); // PCM
    w.extend(1u16.to_le_bytes()); // mono
    w.extend(rate.to_le_bytes());
    w.extend(rate.to_le_bytes());
    w.extend(1u16.to_le_bytes());
    w.extend(8u16.to_le_bytes());
    w.extend(b"data");
    w.extend((data.len() as u32).to_le_bytes());
    w.extend(data);
    w
}

fn main() {
    let out = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| "arch-ade-test-folder".into()));
    fs::create_dir_all(&out).unwrap();
    let d = out.as_path();

    // Images
    let img = picture(320, 200, 1);
    for ext in ["png", "jpg", "bmp", "tiff", "gif"] {
        save_img(d, &format!("images/landscape.{ext}"), &img);
    }
    save_img(d, "images/favicon.ico", &picture(32, 32, 3));
    write(
        d,
        "images/vector.svg",
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#2b1a4a"/><circle cx="32" cy="32" r="16" fill="#ffcc4d"/></svg>"##,
    );
    for i in 1..=12 {
        save_img(d, &format!("images/batch/IMG_{:04}.png", 1000 + i), &picture(64, 48, i));
    }

    // Text-ish
    write(d, "notes/readme.txt", "Plain text notes.\nLine two.\n");
    write(d, "notes/guide.md", "# Heading\n\nSome **bold** text and a [link](https://example.com).\n\n![remote image is blocked](https://example.com/x.png)\n\n- one\n- two\n");
    write(d, "notes/data.json", r#"{"name":"arch-ade","nums":[1,2,3],"nested":{"ok":true}}"#);
    write(d, "notes/table.csv", "name,size,\"note, with comma\"\nalpha,1,\"say \"\"hi\"\"\"\nbeta,2,x\n");
    write(d, "notes/table.tsv", "a\tb\tc\n1\t2\t3\n");
    write(d, "notes/page.html", "<h1>Sandboxed HTML</h1><p>The script below must not run.</p><script>document.body.innerHTML='SCRIPT RAN'</script><img src='https://example.com/tracker.png'>");
    write(d, "notes/utf16.txt", {
        let mut v = vec![0xFF, 0xFE];
        for u in "UTF-16 text with BOM: héllo".encode_utf16() {
            v.extend(u.to_le_bytes());
        }
        v
    });
    write(d, "notes/no-extension", "This file has no extension but is text.\n");
    write(d, "documents/sample.pdf", pdf());
    write(
        d,
        "documents/Budget.gsheet",
        r#"{"url": "https://docs.google.com/spreadsheets/d/EXAMPLE", "doc_id": "EXAMPLE", "email": "you@example.com"}"#,
    );
    docx(d);
    xlsx(d);

    // Media
    write(d, "media/beep.wav", wav());

    // Archives and things that must never be opened or run
    zip(d, "archives/bundle.zip", &[("readme.txt", b"inside zip"), ("folder/inner.txt", b"nested")]);
    {
        let f = create(d, "archives/bundle.tar.gz");
        let gz = flate2::write::GzEncoder::new(f, flate2::Compression::default());
        let mut t = tar::Builder::new(gz);
        let mut h = tar::Header::new_gnu();
        h.set_size(5);
        h.set_cksum();
        t.append_data(&mut h, "hello.txt", &b"hello"[..]).unwrap();
        t.into_inner().unwrap().finish().unwrap();
    }
    write(d, "archives/fake-installer.dmg", b"not a real disk image");
    write(d, "archives/fake-installer.pkg", b"not a real package");

    // Duplicates: two exact copies, plus a same-size impostor.
    let blob: Vec<u8> = (0..200_000u32).map(|i| (i * 7 % 251) as u8).collect();
    write(d, "dupes/original.bin", &blob);
    write(d, "dupes/copy of original.bin", &blob);
    let mut near = blob.clone();
    near[100_000] ^= 0xFF;
    write(d, "dupes/same-size-different.bin", near);
    write(d, "dupes/photo-copy.png", fs::read(d.join("images/landscape.png")).unwrap());

    // Names that stress the path rules
    write(d, "names/café-nfc.txt", "NFC é");
    write(d, "names/cafe\u{301}-nfd.txt", "NFD e + combining accent");
    write(d, "names/Mixed Case.TXT", "case");
    write(d, "names/emoji 🎮 game.txt", "emoji");
    write(d, "names/spaces   and  tabs.txt", "spaces");
    write(d, "names/.hidden-file", "hidden");

    // Partial downloads (ignored by the watcher) and a project folder (Phase 2 protection)
    write(d, "downloads/movie.mkv.crdownload", b"partial");
    write(d, "downloads/archive.zip.part", b"partial");
    write(d, "project/.git/HEAD", "ref: refs/heads/main\n");
    write(d, "project/Cargo.toml", "[package]\nname = \"demo\"\n");
    write(d, "project/src/main.rs", "fn main() {}\n");

    write(d, "empty-file", b"");

    // Download source metadata where the OS lets us set it.
    #[cfg(target_os = "linux")]
    {
        // Ignored on filesystems without user xattrs (e.g. tmpfs).
        let p = d.join("documents/sample.pdf");
        let _ = xattr::set(&p, "user.xdg.origin.url", b"https://files.slack.com/files-pri/T0/sample.pdf");
        let p = d.join("archives/bundle.zip");
        let _ = xattr::set(&p, "user.xdg.origin.url", b"https://codeload.github.com/example/bundle/zip/main");
        let _ = xattr::set(&p, "user.xdg.referrer.url", b"https://github.com/example/bundle");
    }

    println!("Created sample folder at {}", fs::canonicalize(d).unwrap().display());
}
