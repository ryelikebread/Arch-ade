use std::path::{Path, PathBuf};

use objc2_foundation::{NSFileManager, NSString, NSURL};

use super::{Os, Platform, RawSource, TrashReceipt};
use crate::names::NameRules;
use crate::tools::{self, Tools};
use crate::{Error, Result};

pub struct Mac;

impl Platform for Mac {
    fn os(&self) -> Os {
        Os::Macos
    }
    fn name_rules(&self) -> NameRules {
        NameRules::Macos
    }
    fn modifier_label(&self) -> &'static str {
        "Cmd"
    }

    /// Uses NSFileManager directly (not the `trash` crate) because it tells
    /// us where in the Trash the item landed, which undo needs.
    fn trash(&self, path: &Path) -> Result<TrashReceipt> {
        let ns_path = NSString::from_str(&path.to_string_lossy());
        let url = NSURL::fileURLWithPath(&ns_path);
        let fm = NSFileManager::defaultManager();
        let mut resulting = None;
        fm.trashItemAtURL_resultingItemURL_error(&url, Some(&mut resulting))
            .map_err(|e| Error::Trash(e.localizedDescription().to_string()))?;
        let token = resulting.and_then(|u| u.path()).map(|p| p.to_string());
        Ok(TrashReceipt { original: path.to_path_buf(), token })
    }

    fn restore(&self, receipt: &TrashReceipt) -> Result<()> {
        let from = receipt
            .token
            .as_ref()
            .map(PathBuf::from)
            .ok_or_else(|| Error::Trash("the trash location was not recorded".into()))?;
        if !from.exists() {
            return Err(Error::NotFound(format!("{} is no longer in the Trash", receipt.original.display())));
        }
        if receipt.original.exists() {
            return Err(Error::Trash(format!("{} already exists", receipt.original.display())));
        }
        super::move_path(&from, &receipt.original)
    }

    fn raw_source(&self, path: &Path) -> RawSource {
        RawSource {
            where_froms: xattr::get(path, "com.apple.metadata:kMDItemWhereFroms").ok().flatten(),
            quarantine: xattr::get(path, "com.apple.quarantine")
                .ok()
                .flatten()
                .map(|v| String::from_utf8_lossy(&v).into_owned()),
            ..Default::default()
        }
    }

    fn added_time(&self, path: &Path) -> Option<i64> {
        added_time(path)
    }

    fn is_screen_capture(&self, path: &Path) -> Option<bool> {
        let raw = xattr::get(path, "com.apple.metadata:kMDItemIsScreenCapture").ok().flatten();
        // macOS screenshots carry the attribute. Its absence proves nothing
        // (other capture tools don't set it), so that stays "unknown".
        raw.and_then(|r| crate::source::plist_bool(&r)).filter(|b| *b)
    }

    fn tags_supported(&self) -> bool {
        true
    }
    fn read_tags(&self, path: &Path) -> Vec<String> {
        super::xattr_tags::read(path, crate::tags::FINDER_TAGS_XATTR, crate::tags::finder_names)
    }
    fn add_tags(&self, path: &Path, tags: &[String]) -> Result<Option<Vec<u8>>> {
        super::xattr_tags::add(path, crate::tags::FINDER_TAGS_XATTR, tags, crate::tags::finder_add)
    }
    fn restore_tags(&self, path: &Path, previous: Option<&[u8]>) -> Result<()> {
        super::xattr_tags::restore(path, crate::tags::FINDER_TAGS_XATTR, previous)
    }

    fn os_thumbnail(&self, path: &Path, px: u32, tools: &Tools) -> Option<Vec<u8>> {
        let ql = tools.qlmanage.as_ref()?;
        let dir = tempfile::tempdir().ok()?;
        let args: Vec<String> = vec![
            "-t".into(),
            "-s".into(),
            px.to_string(),
            "-o".into(),
            dir.path().to_string_lossy().into(),
            path.to_string_lossy().into(),
        ];
        tools::run(ql, &args, tools::THUMB_TIMEOUT).ok()?;
        // qlmanage writes "<file name>.png" into the output dir.
        let name = format!("{}.png", path.file_name()?.to_string_lossy());
        std::fs::read(dir.path().join(name)).ok()
    }

    fn extra_tool_dirs(&self) -> Vec<PathBuf> {
        ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin"].iter().map(PathBuf::from).collect()
    }
}

/// "Date Added" as Finder shows it, via getattrlist(ATTR_CMN_ADDEDTIME).
fn added_time(path: &Path) -> Option<i64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    const ATTR_BIT_MAP_COUNT: u16 = 5;
    const ATTR_CMN_ADDEDTIME: u32 = 0x1000_0000;

    #[repr(C)]
    struct AttrList {
        bitmapcount: u16,
        reserved: u16,
        commonattr: u32,
        volattr: u32,
        dirattr: u32,
        fileattr: u32,
        forkattr: u32,
    }
    #[repr(C, packed(4))]
    struct Buf {
        len: u32,
        sec: i64,
        nsec: i64,
    }
    unsafe extern "C" {
        fn getattrlist(
            path: *const std::ffi::c_char,
            attr_list: *mut AttrList,
            attr_buf: *mut std::ffi::c_void,
            attr_buf_size: usize,
            options: u32,
        ) -> i32;
    }

    let c = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut list = AttrList {
        bitmapcount: ATTR_BIT_MAP_COUNT,
        reserved: 0,
        commonattr: ATTR_CMN_ADDEDTIME,
        volattr: 0,
        dirattr: 0,
        fileattr: 0,
        forkattr: 0,
    };
    let mut buf = Buf { len: 0, sec: 0, nsec: 0 };
    // SAFETY: buffers are sized and laid out as getattrlist(2) documents.
    let rc = unsafe {
        getattrlist(c.as_ptr(), &mut list, &mut buf as *mut Buf as *mut std::ffi::c_void, std::mem::size_of::<Buf>(), 0)
    };
    let (len, sec) = (buf.len, buf.sec);
    (rc == 0 && len as usize >= std::mem::size_of::<Buf>() && sec > 0).then_some(sec)
}
