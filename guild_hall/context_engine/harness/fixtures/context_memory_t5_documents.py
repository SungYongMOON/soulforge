"""Explicit public fixture preparation, never imported by a query runtime.

Usage: python -I -B context_memory_t5_documents.py --font <ttf> --output <dir>
Requires the frozen T4 source next to the output directory. No source edits.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import importlib.metadata
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

args = argparse.ArgumentParser()
args.add_argument('--font', required=True)
args.add_argument('--output', required=True)
opts = args.parse_args()
out = Path(opts.output)
source_file = out / 't4-sources.json'
source_bytes = source_file.read_bytes()
sources = json.loads(source_bytes)['sources']
font_bytes = Path(opts.font).read_bytes()
pdfmetrics.registerFont(TTFont('Fixture', opts.font))
sha = lambda value: hashlib.sha256(value).hexdigest()

def wrap(text):
    result, line = [], ''
    for word in text.split(' '):
        candidate = line + (' ' if line else '') + word
        if line and pdfmetrics.stringWidth(candidate, 'Fixture', 10) > 495:
            result.append(line)
            line = word
        else:
            line = candidate
    return result + [line]

def build(key, value):
    records = json.loads(value)['records']
    stream = io.BytesIO()
    pdf = canvas.Canvas(stream, pagesize=(595, 842), invariant=1, pageCompression=0)
    pdf.setTitle('T5 public synthetic ' + key)
    pdf.setAuthor('Soulforge public synthetic fixture')
    pdf.setCreator('context-memory-t5-document/1')
    pdf.setSubject('Format-only derivative of frozen T4, no acceptance')
    pdf.setFont('Fixture', 16)
    pdf.drawString(50, 792, 'T5 ' + key + ' - synthetic source statements')
    y = 745
    for record in records:
        pdf.setFont('Fixture', 10)
        for line in wrap(record['id'] + ': ' + record['statement']):
            pdf.drawString(50, y, line)
            y -= 14
        y -= 24
    assert y > 50, 'fixture paragraph overflow'
    pdf.showPage()
    pdf.setFont('Fixture', 15)
    pdf.drawString(50, 792, key + ' values - ruled table')
    # Two rows, two columns; these are existing record values, not new facts.
    selected = [r for r in records if r['id'] in ['D-CURRENT', 'C-LIMIT']]
    if len(selected) != 2:
        selected = records[:2]
    xs, top, height = [50, 300, 545], 660, 60
    for x in xs:
        pdf.line(x, top-height*len(selected), x, top)
    for i in range(len(selected)+1):
        pdf.line(xs[0], top-height*i, xs[-1], top-height*i)
    pdf.setFont('Fixture', 10)
    for i, record in enumerate(selected):
        pdf.drawString(62, top-height*i-34, record['id'])
        pdf.drawString(312, top-height*i-34, record['value'])
    pdf.save()
    return stream.getvalue()

manifest = {'profile':'context-memory-t5-document/1', 'upstream_file_sha256':sha(source_bytes),
    'generator_sha256':sha(Path(__file__).read_bytes()), 'font_sha256':sha(font_bytes),
    'reportlab_version':importlib.metadata.version('reportlab'), 'invariant':True,
    'page_size_points':[595,842], 'page_compression':False, 'sources':{}}
for key, value in sources.items():
    data = build(key, value)
    assert data == build(key, value), 'PDF generation not deterministic'
    name = 't5-document-' + key + '.pdf'
    (out/name).write_bytes(data)
    manifest['sources'][key] = {'file':name, 'sha256':sha(data), 'byte_count':len(data),
        'upstream_json_sha256':sha(value.encode()), 'relation':'format_only_derivative',
        'accepted':False, 'replay_equal':True}
(out/'t5-document-generation.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest))
