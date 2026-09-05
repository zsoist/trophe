import unittest,sys,pathlib,zipfile,tempfile
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'tools/anatomy'))
from archive import inspect_archive
class ArchiveTests(unittest.TestCase):
 def check(self,name,content=b'v 0 0 0\n',mode=None):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'x.zip'
   with zipfile.ZipFile(p,'w') as z:
    info=zipfile.ZipInfo(name)
    if mode:info.external_attr=mode<<16
    z.writestr(info,content)
   return inspect_archive(p)
 def test_valid(self):self.assertEqual(self.check('mesh/FJ1.obj')['obj_count'],1)
 def test_official_m_suffix(self):self.assertEqual(self.check('mesh/FJ1383M.obj')['element_ids'],['FJ1383M'])
 def test_traversal(self):
  with self.assertRaises(ValueError):self.check('../FJ1.obj')
 def test_symlink(self):
  with self.assertRaises(ValueError):self.check('FJ1.obj',b'/etc/passwd',0o120777)
 def test_unexpected_executable(self):
  with self.assertRaises(ValueError):self.check('run.py')
 def test_duplicate_element(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d)/'x.zip'
   with zipfile.ZipFile(p,'w') as z:z.writestr('a/FJ1.obj','');z.writestr('b/FJ1.obj','')
   with self.assertRaises(ValueError):inspect_archive(p)
