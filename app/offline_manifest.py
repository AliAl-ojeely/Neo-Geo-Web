"""Generate a consistent worker and manifest after all static assets are final."""

import hashlib
import json


def write_bundle(site, template_path):
    existing = sorted(
        p for p in site.rglob('*') if p.is_file() and p.relative_to(site).as_posix()
        not in {'.nojekyll', 'offline-sw.js', 'offline-manifest.json'}
    )
    signature = '\n'.join(
        p.relative_to(site).as_posix() + ':' + hashlib.sha256(p.read_bytes()).hexdigest() for p in existing
    )
    build_id = hashlib.sha256(signature.encode('utf-8')).hexdigest()[:16]
    template = (template_path).read_text(encoding='utf-8')
    if template.count('__NG_OFFLINE_BUILD_ID__') != 1:
        raise RuntimeError('Offline Service Worker build token is missing or ambiguous')
    (site / 'offline-sw.js').write_text(
        template.replace('__NG_OFFLINE_BUILD_ID__', build_id), encoding='utf-8'
    )
    offline_paths = existing + [site / 'offline-sw.js']
    offline_files = [
        {
            'path': p.relative_to(site).as_posix(),
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'bytes': p.stat().st_size,
        }
        for p in offline_paths
    ]
    (site / 'offline-manifest.json').write_text(
        json.dumps({
            'schema': 1,
            'id': build_id,
            'files': offline_files,
            'totalBytes': sum(x['bytes'] for x in offline_files),
        }, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
