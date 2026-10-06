"""Generates the placeholder app icon (original pixel art) at icons/source.png.

Run: python3 tools/make-icon.py && npx tauri icon src-tauri/icons/source.png
"""
from pathlib import Path
from PIL import Image

ART = [
    "................",
    ".PPPPPPPPPPPPPP.",
    "PPPPPPPPPPPPPPPP",
    "PPYYYYYPPPPPPPPP",
    "PPYOOOOYPPPPPPPP",
    "PPYYYYYYYYYYYYPP",
    "PPYOOOOOOOOOOYPP",
    "PPYOOOOOOOOOOYPP",
    "PPYOOOOWWOOOOYPP",
    "PPYOOOWRRWOOOYPP",
    "PPYOOOWRRWOOOYPP",
    "PPYOOOOWWOOOOYPP",
    "PPYOOOOOOOOOOYPP",
    "PPYYYYYYYYYYYYPP",
    ".PPPPPPPPPPPPPP.",
    "................",
]
COLORS = {
    ".": (0, 0, 0, 0),
    "P": (43, 26, 74, 255),     # night purple
    "Y": (255, 204, 77, 255),   # folder edge
    "O": (240, 160, 48, 255),   # folder body
    "W": (255, 246, 222, 255),  # button rim
    "R": (232, 64, 87, 255),    # arcade button
}

img = Image.new("RGBA", (16, 16))
for y, row in enumerate(ART):
    for x, ch in enumerate(row):
        img.putpixel((x, y), COLORS[ch])
out = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "source.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.resize((1024, 1024), Image.NEAREST).save(out)
print(out)
