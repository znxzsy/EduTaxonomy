from pathlib import Path
import unittest,json,re,csv,io,zipfile,xml.etree.ElementTree as ET
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
TAX=json.loads((ROOT/'examples/math-taxonomy.json').read_text(encoding='utf-8'))['tables']
GRAPH=json.loads((ROOT/'examples/math-graph.json').read_text(encoding='utf-8'))

class TaxonomyContract(unittest.TestCase):
 def test_counts_and_unique_ids(self):
  self.assertEqual({k:len(v) for k,v in TAX.items()},{'D1': 4, 'D2': 3, 'D3': 40, 'D4': 12, 'D6': 16})
  ids=[i for t in TAX.values() for i in t]
  self.assertEqual(len(ids),len(set(ids)))
  self.assertEqual(set(ids),set(GRAPH))
  self.assertNotIn('D5',TAX)

 def test_dictionary_and_graph_agree(self):
  for dim,table in TAX.items():
   for tid,r in table.items():
    g=GRAPH[tid];self.assertEqual(g[0:2],[dim,r['tag_name']]);self.assertEqual(tid,r['tag_id'])
    if dim in ('D2','D3','D4'):
     self.assertEqual(g[2],r['entrance_id']);self.assertEqual(g[3],r['stages'])
    if dim=='D3':self.assertEqual(g[4],r['allowed_D2_ids'])
    if dim=='D4':
     self.assertEqual(g[4],r['knowledge_domains']);self.assertEqual(g[5],r['related_D3_ids'])
     self.assertEqual(g[7],r['prerequisite_ids']);self.assertEqual(g[8],r['related_D4_ids'])
    if dim=='D6':self.assertEqual(g[2],r['facet']);self.assertEqual(g[3],r.get('parent_id',''))

 def test_all_references_resolve(self):
  targets={'entrance_id':'D1','stage_ids':'D1','allowed_D2_ids':'D2','related_D3_ids':'D3','prerequisite_ids':'D4','related_D4_ids':'D4','parent_id':'D6'}
  for dim,table in TAX.items():
   for tid,r in table.items():
    for field,target in targets.items():
     v=r.get(field,[]);v=v if isinstance(v,list) else [v]
     for ref in v:
      if ref:self.assertIn(ref,TAX[target],(tid,field,ref))

 def test_d3_owners_and_parents_agree(self):
  for r in TAX['D3'].values():
   self.assertTrue(r['allowed_D2_ids'])
   for parent in r['allowed_D2_ids']:self.assertEqual(TAX['D2'][parent]['entrance_id'],r['entrance_id'])

 def test_eight_independent_facets(self):
  self.assertEqual({r['facet'] for r in TAX['D6'].values()},{'作答形式','设问任务','规定作答动作','答题区版式','答案内容','题面线索','实际作答特征','评阅要求'})

 def test_csv_matches_public_sample(self):
  with (ROOT/'examples/math-nodes.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
  self.assertEqual({r['tag_id'] for r in rows},set(GRAPH));self.assertEqual(len(rows),75)

 def test_release_is_a_limited_mathematics_demo(self):
  self.assertLess(len(GRAPH),100)
  self.assertEqual(set(TAX['D2']),{'M01','M02','M03'})
  for level in ['D2','D3','D4']:
   self.assertTrue(all(r['entrance_id']=='D1-MATH' for r in TAX[level].values()))
  self.assertFalse((ROOT/'data').exists())
  self.assertFalse((ROOT/'downloads').exists())

 def test_built_page_is_self_contained(self):
  html=(ROOT/'index.html').read_text(encoding='utf-8')
  embedded=json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>',html,re.S).group(1))
  self.assertEqual(embedded,GRAPH)
  self.assertNotRegex(html,r'<script[^>]+src=')
  self.assertNotRegex(html,r'<(?:iframe|img)[^>]+src="https?://')
  for f in ['examples/math-nodes.csv','examples/math-taxonomy.json']:self.assertIn(f,html)

 def test_public_release_audit(self):
  spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/audit.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  self.assertEqual(m.audit()['issues'],[])

if __name__=='__main__':unittest.main()
