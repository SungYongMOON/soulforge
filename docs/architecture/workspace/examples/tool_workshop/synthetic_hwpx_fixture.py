"""Build a public synthetic structural fixture, not an arbitrary-template renderer."""
import hashlib
import pathlib
import sys
import zipfile

BASE = pathlib.Path(__file__).resolve().parents[5]/'.registry/skills/hwpx_document/codex/templates/base'
PINS = {'Contents/header.xml': '5695dfef65e1045496eb71e775fc7f4a101f0558bbe077243d499db0471b7528', 'Contents/section0.xml': 'd2961d4a9377946b61d5ae1101a79a4fc344c46a3b8f0d788c77dbfd08cf783a', 'Contents/content.hpf': '7cce49d1135023e63834c805bfc0c76cc280d198e2659abe93afb72074ad27f2', 'settings.xml': '03fa1020d75b771b95ecdff52c3a633b7376af04b5af204ba26b189993768ec4', 'version.xml': 'e37d8b12b97f69fa27a5930e0e92c616c6a22eef6211c9b58e906fbd19c08052'}


def build(output):
    sources = {name: (BASE/name).read_bytes() for name in PINS}
    assert all(hashlib.sha256(data).hexdigest() == PINS[name] for name, data in sources.items())
    header, section = sources['Contents/header.xml'], sources['Contents/section0.xml']
    section = section.replace(b'<hp:t/>', b'<hp:t>{{TITLE}}</hp:t>')
    table = '<hp:p id="20" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="30" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="2" colCnt="2" cellSpacing="0" borderFillIDRef="1" noAdjust="0"><hp:sz width="42520" height="7200" widthRelTo="ABSOLUTE" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="142" bottom="142"/>'
    values = [['항목', '결과'], ['합성 검토', '{{BODY}}']]
    for row in range(2):
        table += '<hp:tr>'
        for col in range(2):
            table += f'<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="1"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="{40+row*2+col}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>{values[row][col]}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="{col}" rowAddr="{row}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="21260" height="3600"/><hp:cellMargin left="510" right="510" top="142" bottom="142"/></hp:tc>'
        table += '</hp:tr>'
    table += '</hp:tbl></hp:run></hp:p>'
    section = section.replace(b'</hs:sec>', table.encode()+b'</hs:sec>')
    contents = {'mimetype': b'application/hwp+zip', 'Contents/header.xml': header, 'Contents/section0.xml': section,
                'Contents/content.hpf': sources['Contents/content.hpf'],
                'META-INF/container.xml': b'<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>',
                'META-INF/manifest.xml': b'<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>',
                'settings.xml': sources['settings.xml'], 'version.xml': sources['version.xml']}
    with zipfile.ZipFile(output, 'x') as archive:
        for name, data in contents.items():
            entry = zipfile.ZipInfo(name, (2000, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED if name == 'mimetype' else zipfile.ZIP_DEFLATED
            archive.writestr(entry, data)


if __name__ == '__main__':
    build(pathlib.Path(sys.argv[1]))
