"""Synthetic read-only graph preview contract; no DB or model calls."""
import importlib.util
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

path = pathlib.Path(__file__).resolve().parents[1] / 'src/workers/graphrag_worker.py'
spec = importlib.util.spec_from_file_location('preview_worker', path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Query(str):
    def __new__(cls, text, timeout):
        value = str.__new__(cls, text)
        value.timeout = timeout
        return value

class Driver:
    def __init__(self, changed=False):
        self.calls, self.checks, self.changed = [], 0, changed
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def execute_query(self, query, **params):
        self.calls.append((query, params))
        if 'RETURN g.generation_id' in query:
            self.checks += 1
            rows = [{'generation':'g2' if self.changed and self.checks > 1 else 'g1'}]
        elif 'labels(n)' in query:
            rows = [{'id':f'n{i}', 'document':'sha256:'+'a'*64, 'labels':['Chunk'], 'name':''} for i in range(81)]
        else:
            rows = [{'id':f'e{i}', 'source':'n1', 'target':'n0', 'type':'FROM_DOCUMENT'} for i in range(161)]
        return types.SimpleNamespace(records=rows)

class PreviewTests(unittest.TestCase):
    def invoke(self, driver, **extra):
        with patch.object(worker, 'neo4j_driver', return_value=(driver, 'synthetic')), patch.dict(sys.modules, {'neo4j':types.SimpleNamespace(Query=Query)}):
            return worker.inspect_subgraph({'project_key':'project-a','generation_id':'g1',**extra})
    def test_bounded_read_queries_only(self):
        driver = Driver()
        result = self.invoke(driver, document='sha256:'+'a'*64)
        self.assertEqual((len(result['nodes']),len(result['edges'])), (80,160))
        self.assertTrue(result['limited'])
        self.assertEqual(len(driver.calls),4)
        for query, params in driver.calls:
            self.assertEqual(params['routing_'],'r')
            self.assertEqual(query.timeout,5)
            self.assertEqual(params['p'],'project-a')
            self.assertNotRegex(query,r'\b(CREATE|MERGE|SET|DELETE|REMOVE|CALL)\b')
            self.assertNotIn('n.text',query)
            self.assertNotIn('n.embedding',query)
        self.assertIn('r.sf_generation=$g',driver.calls[2][0])
        self.assertEqual(len(driver.calls[2][1]['ids']),80)
    def test_changed_generation_refused(self):
        with self.assertRaisesRegex(worker.WorkerError,'graph_preview_generation_changed'):
            self.invoke(Driver(changed=True))
    def test_bad_scope_rejected_before_connecting(self):
        with patch.object(worker,'neo4j_driver') as connect:
            for value in [{'project_key':'x'*513},{'document':'../../file'}]:
                with self.assertRaises(worker.WorkerError):
                    worker.inspect_subgraph({'project_key':'p','generation_id':'g1',**value})
            connect.assert_not_called()

if __name__ == '__main__': unittest.main()
