use std::path::{Path, PathBuf};

use super::{Os, Platform, RawSource, TrashReceipt};
use crate::names::NameRules;
use crate::tools::Tools;
use crate::Result;

pub struct Win;

impl Platform for Win {
    fn os(&self) -> Os {
        Os::Windows
    }
    fn name_rules(&self) -> NameRules {
        NameRules::Windows
    }
    fn modifier_label(&self) -> &'static str {
        "Ctrl"
    }

    fn trash(&self, path: &Path) -> Result<TrashReceipt> {
        super::trash_via_crate(path)
    }
    fn restore(&self, receipt: &TrashReceipt) -> Result<()> {
        super::restore_via_crate(receipt)
    }

    fn raw_source(&self, path: &Path) -> RawSource {
        let mut ads = path.as_os_str().to_owned();
        ads.push(":Zone.Identifier");
        RawSource {
            zone_identifier: std::fs::read(PathBuf::from(ads)).ok().map(|b| String::from_utf8_lossy(&b).into_owned()),
            ..Default::default()
        }
    }

    fn added_time(&self, _path: &Path) -> Option<i64> {
        None
    }

    fn os_thumbnail(&self, path: &Path, px: u32, _tools: &Tools) -> Option<Vec<u8>> {
        // COM wants its own STA thread; keep it off the caller's thread.
        let path = path.to_path_buf();
        std::thread::spawn(move || shell_thumbnail(&path, px)).join().ok().flatten()
    }

    fn extra_tool_dirs(&self) -> Vec<PathBuf> {
        let mut v = vec![];
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(pf) = std::env::var(var) {
                v.push(PathBuf::from(&pf).join("7-Zip"));
            }
        }
        v
    }
}

/// IShellItemImageFactory -> HBITMAP -> RGBA -> PNG.
fn shell_thumbnail(path: &Path, px: u32) -> Option<Vec<u8>> {
    use windows::core::HSTRING;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_RESIZETOFIT};

    // SAFETY: plain COM/GDI calls on a thread we own; every handle is released below.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().ok()?;
        let result = (|| {
            let factory: IShellItemImageFactory =
                SHCreateItemFromParsingName(&HSTRING::from(path.as_os_str()), None).ok()?;
            let hbmp = factory.GetImage(SIZE { cx: px as i32, cy: px as i32 }, SIIGBF_RESIZETOFIT).ok()?;
            let obj = HGDIOBJ(hbmp.0);
            let mut bm = BITMAP::default();
            let got = GetObjectW(obj, std::mem::size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _));
            let (w, h) = (bm.bmWidth, bm.bmHeight);
            let mut pixels = vec![0u8; (w.max(0) * h.max(0) * 4) as usize];
            let mut ok = got != 0 && w > 0 && h > 0;
            if ok {
                let mut info = BITMAPINFO {
                    bmiHeader: BITMAPINFOHEADER {
                        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                        biWidth: w,
                        biHeight: -h, // top-down rows
                        biPlanes: 1,
                        biBitCount: 32,
                        biCompression: BI_RGB.0,
                        ..Default::default()
                    },
                    ..Default::default()
                };
                let dc = GetDC(None);
                let lines =
                    GetDIBits(dc, hbmp, 0, h as u32, Some(pixels.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
                ReleaseDC(None, dc);
                ok = lines == h;
            }
            let _ = DeleteObject(obj);
            if !ok {
                return None;
            }
            // BGRA -> RGBA. Shell bitmaps without alpha report 0; treat as opaque.
            let has_alpha = pixels.chunks_exact(4).any(|p| p[3] != 0);
            for p in pixels.chunks_exact_mut(4) {
                p.swap(0, 2);
                if !has_alpha {
                    p[3] = 255;
                }
            }
            let img = image::RgbaImage::from_raw(w as u32, h as u32, pixels)?;
            let mut out = std::io::Cursor::new(Vec::new());
            img.write_to(&mut out, image::ImageFormat::Png).ok()?;
            Some(out.into_inner())
        })();
        CoUninitialize();
        result
    }
}
