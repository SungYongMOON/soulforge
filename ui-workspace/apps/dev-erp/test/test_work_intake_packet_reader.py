"""Real E14 DTO/Ed25519 tests using the published RFC 8032 vector in memory.

Set WORK_INTAKE_TEST_KIT_ROOT to an explicitly selected existing E14 kit. No
operational configuration/key/source is discovered. Only the public verification
key is written into the temporary synthetic authority fixture. The published
test seed is never written to a file and is never used by production code.
"""
import sys
sys.dont_write_bytecode = True

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

READER_PATH = Path(__file__).resolve().parents[1]/'tools/work_intake_packet_reader.py'
spec = importlib.util.spec_from_file_location('synthetic_packet_reader', READER_PATH)
reader = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = reader
spec.loader.exec_module(reader)


def oid(number):
    return 'o_'+f'{number:032x}'


class E14ReleasedPacketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kit_root = os.environ.get('WORK_INTAKE_TEST_KIT_ROOT')
        if not cls.kit_root:
            raise unittest.SkipTest('explicit existing E14 kit path is required')
        cls.code_pins = {name: reader.sha((Path(cls.kit_root)/'src/sf_sewe'/name).read_bytes()) for name in reader.KIT_FILES}
        kit, _, _ = reader.load_kit(cls.kit_root, cls.code_pins)
        cls.models, cls.codec = kit['models'], kit['codec']
        # RFC 8032 section 7.1, TEST 1. This is a public test vector, not an
        # operational private key and not generated random signing material.
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        cls.test_signer = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(
            '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'))
        cls.public_bytes = bytes.fromhex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='work-intake-e14-synthetic-')
        self.root = Path(self.temp.name)
        self.authority = self.root/'authority'
        self.worker = self.root/'worker'
        self.authority.mkdir(); self.worker.mkdir()
        now = datetime.now(timezone.utc)
        time = lambda seconds: (now+timedelta(seconds=seconds)).strftime('%Y-%m-%dT%H:%M:%SZ')
        self.issued, self.observed, self.expires = time(-60), time(-1), time(600)
        self.packet = {'protocol':'sf.sewe.packet/1.0', 'mission_id':oid(1), 'round':0, 'base_candidate_rev':'none',
            'work_type':'company.discovery', 'work_revision':'1.0.0', 'instructions':'Classify only released synthetic evidence.',
            'facts':[{'fact_id':oid(2), 'status':'FACT', 'segments':[{'kind':'literal', 'text':'Synthetic supplier requests a revised estimate.'}],
                      'depends_on':[], 'source_refs':[oid(3)]}], 'slots':[], 'asset_slots':[],
            'sections':[{'section_id':'evidence', 'title':'Synthetic evidence', 'required':True, 'required_fact_ids':[oid(2)],
                         'allowed_slot_ids':[], 'required_slot_ids':[]}]}
        self.route = {'profile_id':'route.synthetic', 'revision':'1.0.0', 'model_id':'model.synthetic',
            'codec_id':'codec.synthetic', 'transport_id':'transport.synthetic', 'max_request_bytes':65536,
            'max_response_bytes':65536, 'deadline_ms':60000, 'streaming':False, 'redirects':False,
            'auto_retry':False, 'data_class':'RELEASED', 'live_enabled':False}
        self.wire = {'packet':self.packet, 'released_history':[]}
        body = self.codec.canonical(self.wire)
        self.review = {'review_ref':'review.synthetic', 'scope_digest':'a'*64, 'packet_digest':self.codec.digest(self.packet),
            'work_digest':'b'*64, 'policy_epoch':7, 'mode':'HUMAN_REVIEWED_EXACT', 'decision':'ALLOW',
            'actor_ref':'reviewer.synthetic', 'expires_utc':self.expires, 'evidence_refs':['review.evidence.synthetic']}
        self.prepared = {'request_id':oid(4), 'job_id':oid(5), 'mission_id':oid(1), 'round':0,
            'packet_sha256':self.codec.digest(self.packet), 'review_ref':'review.synthetic',
            'body':{'object_id':oid(6), 'revision':'released.r1', 'sha256':reader.sha(body), 'media_type':'application/json',
                    'byte_length':len(body), 'classification':'RELEASED'},
            'route_sha256':self.codec.digest(self.route), 'codec_version':'1.0.0', 'header_profile_sha256':'c'*64}
        self.claims = {'protocol':'sf.sewe.permit/1.0', 'permit_id':oid(7), 'job_id':oid(5), 'mission_id':oid(1), 'round':0,
            'request_sha256':reader.sha(body), 'route_sha256':self.codec.digest(self.route), 'review_ref':'review.synthetic',
            'policy_epoch':7, 'audience':'audience.synthetic', 'issued_utc':self.issued, 'expires_utc':self.expires, 'max_uses':1}
        self.permit = {'key_id':'key.synthetic.public-vector', 'claims':self.claims,
            'signature_hex':self.test_signer.sign(self.codec.canonical(self.claims)).hex()}
        self.config = {'version':1, 'kit_root':self.kit_root, 'kit_code_pins':self.code_pins,
            'writable_roots':[str(self.worker)],
            'expected':{'release_ref':'release.synthetic', 'grant_ref':'grant.synthetic', 'project_ref':'project.synthetic',
                'scope_ref':'scope.synthetic', 'scope_digest':'a'*64, 'work_digest':'b'*64, 'work_type':'company.discovery',
                'work_revision':'1.0.0', 'audience':'audience.synthetic', 'route_profile_id':'route.synthetic',
                'route_sha256':self.codec.digest(self.route), 'model_id':'model.synthetic', 'header_profile_sha256':'c'*64,
                'review_ref':'review.synthetic', 'reviewer_ref':'reviewer.synthetic', 'permit_id':oid(7),
                'key_id':'key.synthetic.public-vector', 'policy_epoch':7, 'max_body_bytes':65536,
                'expires_utc':self.expires, 'wire_profile':'sf.sewe.packet-envelope.v1'}}
        self.current = {'active':True, 'grant_active':True, 'review_active':True, 'key_active':True,
            **{key:self.config['expected'][key] for key in ('grant_ref','release_ref','project_ref','scope_ref','audience',
                'model_id','review_ref','permit_id','key_id','policy_epoch')},
            'issued_utc':self.issued, 'observed_utc':self.observed, 'expires_utc':self.expires, 'revoked':False}
        for name, value in [('released_body',self.wire), ('prepared',self.prepared), ('review',self.review),
                            ('permit',self.permit), ('route',self.route)]:
            self.save(name, value)
        public_path = self.authority/'public-verification-key.bin'
        public_path.write_bytes(self.public_bytes)
        self.config['public_key'] = {'path':str(public_path), 'sha256':reader.sha(self.public_bytes)}
        self.current_path = self.authority/'current.json'
        self.current_path.write_bytes(self.codec.canonical(self.current))
        self.config['current'] = {'path':str(self.current_path), 'sha256':None}
        self.binding_path = self.authority/'binding.json'
        self.seal()

    def tearDown(self):
        self.temp.cleanup()

    def save(self, name, value):
        raw = value if type(value) is bytes else self.codec.canonical(value)
        target = self.authority/(name+'.json')
        target.write_bytes(raw)
        self.config[name] = {'path':str(target), 'sha256':reader.sha(raw)}

    def seal(self):
        raw = self.codec.canonical(self.config)
        self.binding_path.write_bytes(raw)
        self.binding_sha = reader.sha(raw)

    def resign(self):
        self.permit['signature_hex'] = self.test_signer.sign(self.codec.canonical(self.claims)).hex()
        self.save('permit', self.permit)

    def verify(self):
        return reader.verify_release(str(self.binding_path), self.binding_sha)

    def test_real_ed25519_typed_release_and_actual_cli_output(self):
        result = self.verify()
        self.assertEqual(result['status'], 'VERIFIED_RELEASE')
        self.assertEqual(result['packet'], self.packet)
        self.assertEqual(result['release']['packet_sha256'], self.prepared['packet_sha256'])
        self.assertEqual(result['release']['body_sha256'], self.prepared['body']['sha256'])
        self.assertEqual(result['release']['project_ref'], 'project.synthetic')
        native = subprocess.run([sys.executable, '-B', str(READER_PATH), '--binding', str(self.binding_path),
            '--sha256', self.binding_sha], capture_output=True, check=True)
        decoded = json.loads(native.stdout)
        self.assertEqual(decoded['status'], 'VERIFIED_RELEASE')
        self.assertEqual(decoded['packet'], self.packet)
        self.assertEqual(native.stderr, b'')
        self.assertNotIn('signature_hex', decoded['release'])

    def test_deny_review_required_and_g2_prepared_are_not_releases(self):
        for decision in ('DENY', 'REVIEW_REQUIRED'):
            self.review['decision'] = decision
            self.save('review', self.review); self.seal()
            with self.assertRaises(reader.ReleaseHold): self.verify()
        self.review['decision'] = 'ALLOW'
        self.save('review', self.review)
        self.prepared['body']['classification'] = 'RELEASE_CANDIDATE'
        self.save('prepared', self.prepared); self.seal()
        with self.assertRaisesRegex(reader.ReleaseHold, 'NOT_RELEASED'): self.verify()

    def test_permit_signature_wrong_key_and_wrong_audience_are_refused(self):
        self.permit['signature_hex'] = '0'*128
        self.save('permit', self.permit); self.seal()
        with self.assertRaises(Exception): self.verify()
        self.resign()
        self.claims['audience'] = 'wrong.audience'
        self.resign(); self.seal()
        with self.assertRaises(reader.ReleaseHold): self.verify()
        self.claims['audience'] = 'audience.synthetic'
        self.resign()
        wrong_public = b'\x01'*32
        Path(self.config['public_key']['path']).write_bytes(wrong_public)
        self.config['public_key']['sha256'] = reader.sha(wrong_public); self.seal()
        with self.assertRaises(Exception): self.verify()

    def test_expired_review_permit_and_current_scope_project_audience_epoch(self):
        self.review['expires_utc'] = '2000-01-01T00:00:00Z'
        self.save('review', self.review); self.seal()
        with self.assertRaises(reader.ReleaseHold): self.verify()
        self.review['expires_utc'] = self.expires; self.save('review', self.review)
        self.claims['expires_utc'] = '2000-01-01T00:00:00Z'; self.resign(); self.seal()
        with self.assertRaises(reader.ReleaseHold): self.verify()
        self.claims['expires_utc'] = self.expires; self.resign(); self.seal()
        for key in ('project_ref','scope_ref','audience','model_id','policy_epoch','review_ref','key_id','grant_ref'):
            altered = {**self.current, key:8 if key == 'policy_epoch' else 'wrong.synthetic'}
            self.current_path.write_bytes(self.codec.canonical(altered))
            with self.assertRaises(reader.ReleaseHold, msg=key): self.verify()

    def test_independent_reviewer_scope_work_packet_route_and_header_are_exact(self):
        for name, value in [('actor_ref','wrong.reviewer'), ('scope_digest','e'*64), ('work_digest','e'*64), ('packet_digest','e'*64)]:
            changed = {**self.review, name:value}
            self.save('review', changed); self.seal()
            with self.assertRaises(reader.ReleaseHold, msg=name): self.verify()
        self.save('review', self.review)
        self.prepared['header_profile_sha256'] = 'e'*64
        self.save('prepared', self.prepared); self.seal()
        with self.assertRaises(reader.ReleaseHold): self.verify()

    def test_actual_wire_sha_length_and_unknown_history_or_schema_are_rejected(self):
        original_body = Path(self.config['released_body']['path']).read_bytes()
        Path(self.config['released_body']['path']).write_bytes(original_body+b' ')
        with self.assertRaises(reader.ReleaseHold): self.verify()
        Path(self.config['released_body']['path']).write_bytes(original_body)
        original_length = self.prepared['body']['byte_length']
        self.prepared['body']['byte_length'] += 1
        self.save('prepared', self.prepared); self.seal()
        with self.assertRaisesRegex(reader.ReleaseHold, 'BODY_LENGTH'): self.verify()
        self.prepared['body']['byte_length'] = 65537
        self.save('prepared', self.prepared); self.seal()
        with self.assertRaisesRegex(reader.ReleaseHold, 'BODY_BINDING'): self.verify()
        self.prepared['body']['byte_length'] = original_length
        for wire in ({'packet':self.packet, 'released_history':[{'unexpected':'history'}]},
                     {'packet':self.packet,'model':'model.synthetic'},
                     {'packet':{**self.packet,'private_payload':'MUST_NOT_PASS'},'released_history':[]}):
            raw = self.codec.canonical(wire)
            self.save('released_body', raw)
            self.prepared['body']['sha256'] = reader.sha(raw)
            self.prepared['body']['byte_length'] = len(raw)
            self.save('prepared', self.prepared)
            self.claims['request_sha256'] = reader.sha(raw)
            self.resign(); self.seal()
            with self.assertRaises(Exception): self.verify()

    def test_revocation_before_body_and_during_body_are_observed(self):
        for key in ('active','grant_active','review_active','key_active','revoked'):
            altered = {**self.current, key:key == 'revoked'}
            self.current_path.write_bytes(self.codec.canonical(altered))
            with self.assertRaisesRegex(reader.ReleaseHold, 'CURRENT_REVOKED'): self.verify()
        self.current_path.write_bytes(self.codec.canonical(self.current))
        original = reader.read_file
        changed = False
        def revoke_after_read(name, digest, maximum):
            nonlocal changed
            raw = original(name, digest, maximum)
            if name == self.config['released_body']['path'] and not changed:
                changed = True
                self.current_path.write_bytes(self.codec.canonical({**self.current, 'revoked':True}))
            return raw
        with patch.object(reader, 'read_file', revoke_after_read):
            with self.assertRaises(reader.ReleaseHold): self.verify()
        self.assertTrue(changed)

    def test_code_pin_and_writable_authority_refused_without_import_or_body(self):
        self.config['kit_code_pins'] = {**self.code_pins, 'permits.py':'0'*64}
        self.seal()
        with self.assertRaisesRegex(reader.ReleaseHold, 'INPUT_PIN_MISMATCH'): self.verify()
        self.config['kit_code_pins'] = self.code_pins
        self.config['writable_roots'] = [str(self.root)]
        self.seal()
        with self.assertRaisesRegex(reader.ReleaseHold, 'AUTHORITY_WRITABLE'): self.verify()

    def test_cli_hold_redacts_body_paths_and_all_error_details(self):
        self.review['decision'] = 'DENY'
        self.save('review', self.review); self.seal()
        result = subprocess.run([sys.executable, '-B', str(READER_PATH), '--binding', str(self.binding_path),
            '--sha256', self.binding_sha], capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout), {'status':'HOLD','code':'WORK_INTAKE_RELEASE_UNVERIFIED'})
        self.assertEqual(result.stderr, b'')


if __name__ == '__main__':
    unittest.main()
