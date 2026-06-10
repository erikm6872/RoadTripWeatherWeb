"""Assemble the static web bundle for packaging (Capacitor / static hosting).

The app is fully client-side, so "building" is just collecting the files into
``www/``:

    python build_www.py

Output:
    www/index.html
    www/manifest.webmanifest
    www/sw.js
    www/static/...   (css, js, icons)
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).parent
WWW = ROOT / "www"


def main():
    if WWW.exists():
        shutil.rmtree(WWW)
    WWW.mkdir()

    shutil.copy(ROOT / "templates" / "index.html", WWW / "index.html")
    shutil.copy(ROOT / "manifest.webmanifest", WWW / "manifest.webmanifest")
    shutil.copy(ROOT / "sw.js", WWW / "sw.js")
    shutil.copytree(ROOT / "static", WWW / "static")

    files = sorted(p.relative_to(WWW) for p in WWW.rglob("*") if p.is_file())
    print(f"Built www/ with {len(files)} files:")
    for f in files:
        print(f"  {f}")


if __name__ == "__main__":
    main()
