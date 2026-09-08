"""Offline fixture issuance only. Never part of an installed runtime closure."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
sys.path.insert(0, str(Path(sys.argv[2]) / 'src'))
from sf_sewe import codec, models, permits
from soulforge_secure_work import g2_feedback_adapter as adapter
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

request = json.loads(Path(sys.argv[3]).read_text())
root = Path(request['root']).resolve()
assert root.parent == Path(tempfile.gettempdir()).resolve() and root.name.startswith('g2-feedback-')
assert request['synthetic'] is True
stage = sys.argv[1]
if stage == 'field':
    binding, field = adapter.source_field(Path(request['wrapper']).read_bytes(), request['selection'], request['identity'])
    ledger = dict(schema='soulforge.secure_work.field_reviews.v0', synthetic_pilot=True,
        entries=[dict(review_ref=request['profile']['field_review_ref'], field_sha256=codec.digest(field), policy_epoch=1)])
    (root/'field-ledger.json').write_bytes(codec.canonical(ledger))
    key = Ed25519PrivateKey.generate()
    raw_private = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    raw_public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    (root/'fixture-only-signer.key').write_bytes(raw_private)
    (root/'verification.pub').write_text(raw_public.hex()+'\n')
    print(json.dumps(dict(issuer_key_id='trust.'+hashlib.sha256(raw_public).hexdigest()[:32],
        route_sha256=adapter.route_digest(request['route'], request['profile']))))
elif stage == 'review':
    manifest_path = Path(request['manifest'])
    manifest = json.loads(manifest_path.read_bytes())
    parts = {name:(manifest_path.parent/descriptor['file']).read_bytes() for name,descriptor in manifest['parts'].items()}
    evidence = codec.strict_loads(parts['evidence'])
    profile = request['profile']
    review = models.PolicyReview(review_ref=profile['review_ref'], scope_digest=adapter.scope_digest(evidence),
        packet_digest=codec.digest(parts['packet']), work_digest=codec.digest(evidence['work']), policy_epoch=1,
        mode='HUMAN_REVIEWED_EXACT', decision='ALLOW', actor_ref='reviewer:synthetic',
        expires_utc=request['permit_until'], evidence_refs=['evidence:synthetic'])
    key = Ed25519PrivateKey.from_private_bytes((root/'fixture-only-signer.key').read_bytes())
    claims = models.PermitClaims(protocol='sf.sewe.permit/1.0', permit_id='o_'+'3'*32,
        job_id=profile['job_id'], mission_id=profile['mission_id'], round=0, request_sha256=codec.digest(parts['body']),
        route_sha256=adapter.route_digest(request['route'], profile), review_ref=profile['review_ref'], policy_epoch=1,
        audience=profile['audience'], issued_utc=request['permit_from'], expires_utc=request['permit_until'], max_uses=1)
    signed = permits.sign_for_test(claims, key, request['issuer_key_id'])
    (root/'review.json').write_bytes(codec.canonical(review))
    (root/'permit.json').write_bytes(codec.canonical(dict(schema='soulforge.secure_work.permit.v0',
        decision='ALLOW', actor_ref=review.actor_ref, issuer_key_id=request['issuer_key_id'],
        authority='SYNTHETIC_FIXTURE_ONLY', permit=signed.model_dump(mode='json'))))
    print('{"synthetic_review_fixture":true}')
else:
    raise ValueError('unsupported fixture stage')
