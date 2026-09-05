"""Local-only factory boundary. No services, production credentials or schedulers."""
import hashlib
import json
from pathlib import Path, PureWindowsPath
import re


def safe_path(root, relative):
    root = Path(root).resolve(strict=True)
    name = Path(relative)
    if name.is_absolute() or PureWindowsPath(relative).drive or '\\' in relative:
        raise ValueError('Relative portable path required')
    target = (root / name).resolve()
    if target == root or not target.is_relative_to(root):
        raise ValueError('Path escapes artifact root')
    return target


def new_job(root, job_id, fingerprint):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', job_id):
        raise ValueError('Invalid job id')
    if not re.fullmatch(r'[0-9a-f]{64}', fingerprint):
        raise ValueError('Invalid fingerprint')
    job = safe_path(root, job_id)
    job.mkdir()  # Atomic admission; never adopt an existing/foreign directory.
    (job / 'job.json').write_text(json.dumps({'id': job_id, 'input_sha256': fingerprint}))
    return job


def verified_file(root, relative, sha256, size):
    path = safe_path(root, relative)
    if size <= 0 or '.partial' in path.name or not path.is_file():
        raise ValueError('Incomplete artifact')
    if path.stat().st_size != size:
        raise ValueError('Size mismatch')
    with path.open('rb') as stream:
        actual = hashlib.file_digest(stream, 'sha256').hexdigest()
    if actual != sha256:
        raise ValueError('Hash mismatch')
    return path


def reconcile(state, process_alive, exit_code):
    """Absence or age alone is insufficient evidence to release a remote lease."""
    if process_alive or exit_code is None:
        return 'remote_state_unknown'
    if state == 'cancel_requested' and exit_code != 0:
        return 'cancelled'
    return 'succeeded' if exit_code == 0 else 'failed'
