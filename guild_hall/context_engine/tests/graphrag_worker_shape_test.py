"""Synthetic contract for the outline of a refused answer; no model, no DB."""
import importlib.util
import pathlib
import re
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'src/workers/graphrag_worker.py'
spec = importlib.util.spec_from_file_location('shape_worker', path)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

# The same admission the APP applies on its side (graph_extraction.mjs).
ADMITTED = re.compile(r'^(?:[{}\[\]:,"`_ ]|nodes|relationships|properties|embedding_properties|id|label|type'
                      r'|start_node_id|end_node_id)*$')


class AnswerSkeletonTest(unittest.TestCase):
    def test_text_is_masked_and_field_names_survive(self):
        answer = ('Here is the graph:\n```json\n{"nodes": [{"id": "0", "label": "Equipment", '
                  '"properties": {"name": "synthetic item 7"}}], "relationships": [')
        outline = worker.answer_skeleton(answer)
        self.assertEqual(outline, '_ _ _ _: ```_ {"nodes": [{"id": "_", "label": "_", '
                                  '"properties": {"_": "_ _ _"}}], "relationships": [')
        self.assertRegex(outline, ADMITTED)
        for word in ('graph', 'Equipment', 'synthetic', '7'):
            self.assertNotIn(word, outline)

    def test_bounded_and_never_cut_inside_a_field_name(self):
        answer = '{"relationships": [' * 40
        outline = worker.answer_skeleton(answer)
        self.assertLessEqual(len(outline), worker.ANSWER_SKELETON_CHARACTERS)
        self.assertRegex(outline, ADMITTED)
        self.assertEqual(worker.answer_skeleton('x' * 5000), '_')
        self.assertEqual(worker.answer_skeleton(''), '')


if __name__ == '__main__':
    unittest.main()
