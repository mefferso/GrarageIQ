"""Build static GarageIQ Pages bundle from source. No credentials or fuel data."""
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "_site"
VERSION = (sys.argv[1] if len(sys.argv)>1 else "local")[:12]
OUT.mkdir(exist_ok=True)
for name in ("index.html", "styles.css", "app.js", "config.js", "sw.js", "manifest.webmanifest", "icon.svg"):
    shutil.copy2(ROOT / name, OUT / name)
html = (OUT / "index.html").read_text(encoding="utf-8")
for name in ("app.js", "config.js", "styles.css", "manifest.webmanifest", "icon.svg"):
    html = re.sub(r'(["\'])\./' + re.escape(name) + r'(?:\?v=[^"\']*)?\1', lambda m: m.group(1) + "./" + name + "?v=" + VERSION + m.group(1), html)
html = html.replace("</head>", '<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png?v=' + VERSION + '"></head>')
(OUT / "index.html").write_text(html, encoding="utf-8")
import json
manifest_file = OUT / "manifest.webmanifest"
manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
manifest["icons"] = [
    {"src": "./icon-192.png?v=" + VERSION, "sizes": "192x192", "type": "image/png", "purpose": "any"},
    {"src": "./icon-512.png?v=" + VERSION, "sizes": "512x512", "type": "image/png", "purpose": "any"},
    {"src": "./icon.svg?v=" + VERSION, "sizes": "any", "type": "image/svg+xml", "purpose": "any"},
]
manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
import cairosvg
svg = (ROOT / "icon.svg").read_bytes()
for name, pixels in (("apple-touch-icon.png", 180), ("icon-192.png", 192), ("icon-512.png", 512)):
    cairosvg.svg2png(bytestring=svg, write_to=str(OUT/name), output_width=pixels, output_height=pixels)
