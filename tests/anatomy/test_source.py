import unittest,sys,pathlib
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]/'tools/anatomy'))
from catalogue import parse_catalogue, merge_catalogues, laterality
class SourceTests(unittest.TestCase):
 def source(self,parts=None,elements=None):
  return parse_catalogue('isa',parts or 'concept id\trepresentation id\ten\nFMA1\tBP1\tleft bone\nFMA2\tBP2\tbone group\n', 'parent id\tparent name\tchild id\tchild name\nFMA2\tbone group\tFMA1\tleft bone\n',elements or 'concept id\tname\telement file id\nFMA1\tleft bone\tFJ1\nFMA2\tbone group\tFJ1\nFMA2\tbone group\tFJ2\n')
 def test_compound_and_id_preservation(self):
  d=self.source();self.assertEqual(d['concepts']['FMA2']['elements'],['FJ1','FJ2']);self.assertEqual(d['concepts']['FMA1']['representations'],['BP1'])
 def test_duplicate_rows_do_not_duplicate_geometry(self):
  d=self.source(elements='concept id\tname\telement file id\nFMA1\tleft bone\tFJ1\nFMA1\tleft bone\tFJ1\n');self.assertEqual(d['concepts']['FMA1']['elements'],['FJ1'])
 def test_relations_distinct_and_many_to_many(self):
  a=self.source();b=self.source();b['tree']='partof';d=merge_catalogues([a,b],{'FJ1'});self.assertEqual({x['type'] for x in d['relations']},{'isa','partof'});self.assertEqual(d['concepts']['FMA2']['missing_elements'],['FJ2']);self.assertEqual(d['elements']['FJ1']['concept_ids'],['FMA1','FMA2'])
 def test_tree_specific_membership_is_preserved(self):
  a=self.source();b=self.source();b['tree']='partof';b['concepts']['FMA2']['elements']=['FJ2'];b['concepts']['FMA2']['representations']=['BP3']
  d=merge_catalogues([a,b],{'FJ1','FJ2'});c=d['concepts']['FMA2'];self.assertEqual(c['memberships']['isa']['elements'],['FJ1','FJ2']);self.assertEqual(c['memberships']['partof']['elements'],['FJ2']);self.assertEqual(c['memberships']['partof']['representations'],['BP3'])
 def test_missing_not_silently_dropped(self):
  d=merge_catalogues([self.source()],set());self.assertEqual(d['concepts']['FMA1']['availability'],'missing');self.assertEqual(d['elements']['FJ2']['availability'],'missing')
 def test_missing_mapping_separate_from_missing_mesh(self):
  d=merge_catalogues([self.source(elements='concept id\tname\telement file id\nFMA2\tbone group\tFJ2\n')],{'FJ2'});self.assertEqual(d['concepts']['FMA1']['availability'],'unmapped')
 def test_laterality_no_substring_guesses(self):
  self.assertEqual(laterality('left femur'),'left');self.assertEqual(laterality('right femur'),'right');self.assertEqual(laterality('left and right bones'),'bilateral');self.assertEqual(laterality('bright muscle'),'unspecified')
 def test_reject_conflicting_representation(self):
  with self.assertRaises(ValueError):self.source(parts='concept id\trepresentation id\ten\nFMA1\tBP1\tleft bone\nFMA2\tBP1\tright bone\n')
if __name__=='__main__':unittest.main()
