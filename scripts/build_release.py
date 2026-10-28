"""Build the single-file app and release archive from the canonical sources."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=ROOT.parent / 'Master_Calc_v2_Palette.zip')
args = parser.parse_args()
html = (ROOT / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + (ROOT / 'styles.css').read_text() + '</style>')
html = html.replace('<link rel="manifest" href="manifest.json">', '').replace('<link rel="apple-touch-icon" href="icon.png">', '')
html = html.replace('<script src="core.js"></script>', '<script>\n' + (ROOT / 'core.js').read_text() + '</script>')
html = html.replace('<script src="app.js"></script>', '<script>window.MASTER_CALC_STANDALONE=true;\n' + (ROOT / 'app.js').read_text() + '</script>')
(ROOT / 'Master_Calc_v2_Palette.html').write_text(html)
# Change the worker whenever an app-shell file changes, to avoid stale cache versions.
digest = hashlib.sha256(b''.join((ROOT / name).read_bytes() for name in ['index.html','styles.css','core.js','app.js','manifest.json','icon.png'])).hexdigest()[:12]
worker = (ROOT / 'sw.js').read_text()
worker = re.sub(r"const CACHE_NAME = '[^']+';", f"const CACHE_NAME = 'master-calc-v2-palette-{digest}';", worker)
(ROOT / 'sw.js').write_text(worker)
args.output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.output, 'w', ZIP_DEFLATED) as archive:
    for filename in ['index.html','Master_Calc_v2_Palette.html','core.js','app.js','styles.css','sw.js','manifest.json','icon.png',
                     'README.md','ROADMAP_V2.md','RELEASE_NOTES.md','QA_REPORT.md','start_server.py','START_WINDOWS.bat']:
        archive.write(ROOT / filename, 'Master_Calc_v2_Palette/' + filename)
    for folder in ['tests','scripts','qa']:
        for file in sorted((ROOT / folder).rglob('*')):
            # Screenshots are internal QA evidence, not release deliverables.
            if folder == 'qa' and file.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.gif'}:
                continue
            if file.is_file() and '__pycache__' not in file.parts:
                archive.write(file, 'Master_Calc_v2_Palette/' + str(file.relative_to(ROOT)))
print(args.output)
