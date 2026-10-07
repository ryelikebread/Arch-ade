use arch_ade_core::music::{list, resolve, MAX_BYTES};

#[test]
fn lists_audio_files_and_skips_the_rest() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("music");
    std::fs::create_dir_all(dir.join("sub")).unwrap();
    std::fs::write(dir.join("b song.MP3"), b"xx").unwrap();
    std::fs::write(dir.join("a.ogg"), b"xx").unwrap();
    std::fs::write(dir.join("notes.txt"), b"xx").unwrap();
    std::fs::write(dir.join(".hidden.mp3"), b"xx").unwrap();
    std::fs::write(dir.join("empty.wav"), b"").unwrap();
    std::fs::write(dir.join("sub/inner.mp3"), b"xx").unwrap();
    let big = std::fs::File::create(dir.join("huge.flac")).unwrap();
    big.set_len(MAX_BYTES + 1).unwrap();

    let l = list(&dir);
    let names: Vec<_> = l.tracks.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, ["a.ogg", "b song.MP3"]);
    assert_eq!(l.problems, ["huge.flac is over 50 MB"]);
}

#[test]
fn creates_the_folder() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("music");
    assert!(list(&dir).tracks.is_empty());
    assert!(dir.is_dir());
}

#[test]
fn resolve_only_allows_plain_tracks_in_the_folder() {
    let d = tempfile::tempdir().unwrap();
    let dir = d.path().join("music");
    std::fs::create_dir_all(dir.join("sub")).unwrap();
    std::fs::write(dir.join("ok.mp3"), b"xx").unwrap();
    std::fs::write(dir.join("sub/inner.mp3"), b"xx").unwrap();
    std::fs::write(d.path().join("outside.mp3"), b"xx").unwrap();
    std::fs::write(dir.join("doc.txt"), b"xx").unwrap();

    assert_eq!(resolve(&dir, "ok.mp3").unwrap(), dir.join("ok.mp3"));
    for bad in ["", "..", "../outside.mp3", "sub/inner.mp3", "sub", "doc.txt", "missing.mp3", ".hidden.mp3"] {
        assert!(resolve(&dir, bad).is_err(), "{bad} should be refused");
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(d.path().join("outside.mp3"), dir.join("link.mp3")).unwrap();
        assert!(resolve(&dir, "link.mp3").is_err());
        assert!(!list(&dir).tracks.iter().any(|t| t.name == "link.mp3"));
    }
}
