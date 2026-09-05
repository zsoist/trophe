"""Reject unsafe handoffs and ambiguous remote completion before reuse."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[2] / 'tools/media-factory/boundary.py'
spec = importlib.util.spec_from_file_location('boundary', MODULE)
boundary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boundary)

class BoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()

    def test_escape_and_symlink_are_rejected(self):
        (self.root/'link').symlink_to(self.root.parent, target_is_directory=True)
        for path in ('../outside', '/tmp/outside', 'link/outside', 'C:\\outside', 'a/../../outside'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                boundary.safe_path(self.root, path)

    def test_duplicate_job_preserves_existing_inputs(self):
        job = boundary.new_job(self.root, 'curl-01', 'a'*64)
        (job/'input').write_text('original')
        with self.assertRaises(FileExistsError):
            boundary.new_job(self.root, 'curl-01', 'a'*64)
        self.assertEqual((job/'input').read_text(), 'original')

    def test_foreign_directory_cannot_be_adopted(self):
        (self.root/'foreign').mkdir()
        with self.assertRaises(FileExistsError):
            boundary.new_job(self.root, 'foreign', 'a'*64)
        self.assertEqual(list((self.root/'foreign').iterdir()), [])

    def test_partial_or_wrong_hash_never_promotes(self):
        (self.root/'frame.partial').write_bytes(b'abc')
        (self.root/'frame.png').write_bytes(b'abc')
        for path, digest in [('frame.partial',hashlib.sha256(b'abc').hexdigest()),('frame.png','0'*64)]:
            with self.subTest(path=path), self.assertRaises(ValueError):
                boundary.verified_file(self.root,path,digest,3)

    def test_empty_file_cannot_be_delivered(self):
        (self.root/'empty.png').touch()
        with self.assertRaises(ValueError):
            boundary.verified_file(self.root,'empty.png',hashlib.sha256(b'').hexdigest(),0)

    def test_actual_bytes_verified(self):
        (self.root/'frame.png').write_bytes(b'abc')
        self.assertEqual(boundary.verified_file(self.root,'frame.png','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',3),self.root/'frame.png')

    def test_disconnect_cancel_and_expired_live_lease_are_not_success(self):
        for state in ['disconnected','cancel_requested','lease_expired']:
            self.assertEqual(boundary.reconcile(state, True, None),'remote_state_unknown')
        self.assertEqual(boundary.reconcile('cancel_requested',False,130),'cancelled')
        self.assertEqual(boundary.reconcile('finished',False,0),'succeeded')
        self.assertEqual(boundary.reconcile('finished',False,17),'failed')
        self.assertEqual(boundary.reconcile('finished',False,None),'remote_state_unknown')

if __name__ == '__main__': unittest.main()
