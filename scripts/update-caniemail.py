#!/usr/bin/env python3
"""Regenerate the local Can I email subset from a pinned, clean upstream checkout.

Usage: python3 scripts/update-caniemail.py /path/to/caniemail
Requires PyYAML (development-only). No network or application runtime dependency.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import yaml

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'demo/compatibility/caniemail-data.json'
FEATURES = '''css-at-font-face css-at-import css-at-media css-at-media-prefers-color-scheme css-background-image css-background-position css-background-repeat css-background-size css-border-radius css-box-shadow css-box-sizing css-color-scheme css-display-flex css-display-grid css-display-none css-flex-direction css-flex-wrap css-float css-gap css-grid-template css-height css-justify-content css-letter-spacing css-line-height css-linear-gradient css-margin css-max-height css-max-width css-min-height css-min-width css-object-fit css-opacity css-overflow css-padding css-position css-pseudo-class-hover css-text-decoration css-text-shadow css-transform css-unit-calc css-unit-rem css-unit-vh css-unit-vw css-variables html-anchor-links html-background html-form html-link html-srcset html-style html-svg html-video image-base64 image-gif image-svg image-webp'''.split()


def snapshot(files, revision):
    names = yaml.safe_load(files['_data/nicenames.yml'])
    clients = {}
    features = []
    for slug in FEATURES:
        source = files[f'_features/{slug}.md']
        # Upstream front matter uses tabs for indentation in flow mappings.
        data = yaml.safe_load(source.partition('\n')[2].rsplit('\n---', 1)[0].replace('\t', '    '))
        stats = {}
        for family, platforms in data['stats'].items():
            for platform, versions in platforms.items():
                client = f'{family}/{platform}'
                clients[client] = {'id': client, 'label': f"{names['family'].get(family, family)} · {names['platform'].get(platform, platform)}"}
                # Keep source insertion order, not a numeric/date sort. Upstream
                # sometimes changes version notation (e.g. date -> app version).
                version, code = list(versions.items())[-1]
                stats[client] = {'version': str(version), 'code': str(code)}
        features.append({
            'slug': slug, 'title': data['title'],
            'description': data.get('description') or '',
            'lastTestDate': str(data.get('last_test_date') or 'Unknown'),
            'sourceHash': hashlib.sha256(source.encode()).hexdigest(),
            'notes': data.get('notes') or '',
            'notesByNumber': {str(k): str(v) for k, v in (data.get('notes_by_num') or {}).items()},
            'stats': stats,
        })
    return {'repository': 'https://github.com/hteumeuleu/caniemail', 'revision': revision,
            'license': 'MIT', 'clients': sorted(clients.values(), key=lambda x: x['label']),
            'features': features}


if __name__ == '__main__':
    upstream = Path(sys.argv[1]).resolve()
    revision = subprocess.check_output(['git', '-C', str(upstream), 'rev-parse', 'HEAD'], text=True).strip()
    if subprocess.check_output(['git', '-C', str(upstream), 'status', '--porcelain'], text=True).strip():
        raise SystemExit('Upstream checkout must be clean.')
    paths = ['_data/nicenames.yml', 'LICENSE'] + [f'_features/{s}.md' for s in FEATURES]
    files = {path: (upstream / path).read_text() for path in paths}
    DEST.write_text(json.dumps(snapshot(files, revision), ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'docs/third-party/caniemail.LICENSE').write_text(files['LICENSE'])
    print(f'Updated {len(FEATURES)} features from {revision}. Run oxfmt on {DEST.relative_to(ROOT)}.')
