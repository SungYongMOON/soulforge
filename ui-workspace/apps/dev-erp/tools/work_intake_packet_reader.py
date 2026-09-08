"""Read-only consumer of an independently reviewed E14 released WorkPacket.

CLI: --binding ABS.json --sha256 SHA256. The trusted binding pins the named
E14 DTO/codec/permit code, released wire bytes and independent authority records.
Only {packet, released_history: []} is admitted by this narrow consumer mapping;
it neither implements a new E14 wire schema nor prepares/releases any packet.
No producer, signing, source-bundle, vault, field-ledger or transport API is used.
"""
import sys
sys.dont_write_bytecode = True

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import types

HASH = re.compile(r'^[0-9a-f]{64}$')
REF = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$')
KIT_FILES = ('__init__.py', 'models.py', 'codec.py', 'permits.py')
BINDING_KEYS = ('version', 'kit_root', 'kit_code_pins', 'writable_roots', 'released_body',
                'prepared', 'review', 'permit', 'route', 'public_key', 'expected', 'current')
EXPECTED_KEYS = ('release_ref', 'grant_ref', 'project_ref', 'scope_ref', 'scope_digest',
                 'work_digest', 'work_type', 'work_revision', 'audience', 'route_profile_id',
                 'route_sha256', 'model_id', 'header_profile_sha256', 'review_ref', 'reviewer_ref',
                 'permit_id', 'key_id', 'policy_epoch', 'max_body_bytes', 'expires_utc', 'wire_profile')
CURRENT_KEYS = ('active', 'grant_active', 'review_active', 'key_active', 'grant_ref', 'release_ref',
                'project_ref', 'scope_ref', 'audience', 'model_id', 'review_ref', 'permit_id', 'key_id',
                'policy_epoch', 'issued_utc', 'observed_utc', 'expires_utc', 'revoked')


class ReleaseHold(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def require(condition, code):
    if not condition:
        raise ReleaseHold(code)


def exact(value, keys):
    return type(value) is dict and set(value) == set(keys)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def bootstrap_json(raw):
    """Only the small pinned configuration is parsed before loading E14 codec."""
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'BINDING_DUPLICATE_KEY')
            result[key] = value
        return result
    def invalid(_):
        raise ReleaseHold('BINDING_NUMBER_INVALID')
    value = json.loads(raw.decode('utf-8', errors='strict'), object_pairs_hook=pairs,
                       parse_float=invalid, parse_constant=invalid)
    def walk(item, depth=0):
        require(depth <= 16, 'BINDING_DEPTH')
        if type(item) is str:
            require(not any(ord(ch) == 0 or 0xD800 <= ord(ch) <= 0xDFFF for ch in item), 'BINDING_STRING')
        elif type(item) is int:
            require(abs(item) <= 2**53-1, 'BINDING_INTEGER')
        elif type(item) in (list, dict):
            require(len(item) <= 128, 'BINDING_CARDINALITY')
            for child in (list(item) + list(item.values()) if type(item) is dict else item):
                walk(child, depth+1)
        else:
            require(item is None or type(item) is bool, 'BINDING_TYPE')
    walk(value)
    return value


def regular_path(value, directory=False):
    require(type(value) is str and len(value) <= 1024 and '\x00' not in value, 'PATH_INVALID')
    path = Path(value)
    require(path.is_absolute() and not str(path).startswith('\\\\'), 'PATH_INVALID')
    require(os.path.normcase(str(path)) == os.path.normcase(os.path.abspath(value)), 'PATH_INVALID')
    for current in (*reversed(path.parents), path):
        info = current.lstat()
        require(not stat.S_ISLNK(info.st_mode) and not getattr(current, 'is_junction', lambda: False)(), 'PATH_LINK')
    info = path.stat()
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1, 'PATH_KIND')
    require(os.path.normcase(str(path.resolve(strict=True))) == os.path.normcase(str(path)), 'PATH_LINK')
    return path


def read_file(value, expected, maximum):
    path = regular_path(value)
    before = path.stat()
    require(before.st_size <= maximum, 'INPUT_LIMIT')
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_nlink)
    with path.open('rb') as source:
        require(identity(os.fstat(source.fileno())) == identity(before), 'INPUT_CHANGED')
        raw = source.read(maximum+1)
        require(len(raw) <= maximum and identity(os.fstat(source.fileno())) == identity(before), 'INPUT_CHANGED')
    require(identity(regular_path(value).stat()) == identity(before), 'INPUT_CHANGED')
    require(expected is None or type(expected) is str and HASH.fullmatch(expected) and sha(raw) == expected, 'INPUT_PIN_MISMATCH')
    return raw


def outside(path, roots):
    target = os.path.normcase(str(Path(path)))
    for root in roots:
        base = os.path.normcase(str(root))
        try:
            common = os.path.commonpath((base, target))
        except ValueError:  # Distinct Windows drives cannot contain one another.
            continue
        require(common != base, 'AUTHORITY_WRITABLE')


def load_kit(root, pins):
    """Execute exactly pinned source bytes, never an adjacent .pyc or module."""
    require(exact(pins, KIT_FILES), 'KIT_PINS_INVALID')
    package_root = regular_path(str(regular_path(root, True) / 'src/sf_sewe'), True)
    sources = {name: read_file(str(package_root/name), pins[name], 256*1024) for name in KIT_FILES}
    namespace = '_work_intake_pinned_e14_' + sha(b''.join(sources.values()))[:24]
    # A private import namespace avoids accepting previously loaded sf_sewe code.
    for name in ('', '.models', '.codec', '.permits'):
        sys.modules.pop(namespace+name, None)
    package = types.ModuleType(namespace)
    package.__file__ = str(package_root/'__init__.py')
    package.__path__ = []
    package.__package__ = namespace
    sys.modules[namespace] = package
    exec(compile(sources['__init__.py'], package.__file__, 'exec'), package.__dict__)
    modules = {}
    for name in ('models', 'codec', 'permits'):
        module = types.ModuleType(namespace+'.'+name)
        module.__package__ = namespace
        module.__file__ = str(package_root/(name+'.py'))
        sys.modules[module.__name__] = module
        exec(compile(sources[name+'.py'], module.__file__, 'exec'), module.__dict__)
        modules[name] = module
    return modules, sources, package_root


def verify_release(binding_path, binding_sha256):
    require(type(binding_sha256) is str and HASH.fullmatch(binding_sha256), 'BINDING_PIN_REQUIRED')
    binding_raw = read_file(binding_path, binding_sha256, 65536)
    config = bootstrap_json(binding_raw)
    require(exact(config, BINDING_KEYS) and type(config['version']) is int and config['version'] == 1, 'BINDING_SHAPE')
    require(type(config['writable_roots']) is list and 1 <= len(config['writable_roots']) <= 16, 'ROOTS_INVALID')
    roots = [regular_path(root, True) for root in config['writable_roots']]
    require(len({os.path.normcase(str(root)) for root in roots}) == len(roots), 'ROOTS_INVALID')
    outside(binding_path, roots)
    outside(config['kit_root'], roots)
    for name in ('released_body', 'prepared', 'review', 'permit', 'route', 'public_key', 'current'):
        descriptor = config[name]
        require(exact(descriptor, ('path', 'sha256')), 'DESCRIPTOR_INVALID')
        require(descriptor['sha256'] is None if name == 'current' else type(descriptor['sha256']) is str and HASH.fullmatch(descriptor['sha256']), 'DESCRIPTOR_INVALID')
        regular_path(descriptor['path'])
        outside(descriptor['path'], roots)
    paths = [str(Path(binding_path)), *[str(Path(config[name]['path'])) for name in
             ('released_body', 'prepared', 'review', 'permit', 'route', 'public_key', 'current')]]
    require(len({os.path.normcase(path) for path in paths}) == len(paths), 'DESCRIPTOR_ALIAS')
    expected = config['expected']
    require(exact(expected, EXPECTED_KEYS), 'EXPECTED_SHAPE')
    for name in ('release_ref', 'grant_ref', 'project_ref', 'scope_ref', 'work_type', 'audience',
                 'route_profile_id', 'review_ref', 'reviewer_ref', 'permit_id', 'key_id'):
        require(type(expected[name]) is str and REF.fullmatch(expected[name]), 'EXPECTED_REF')
    for name in ('scope_digest', 'work_digest', 'route_sha256', 'header_profile_sha256'):
        require(type(expected[name]) is str and HASH.fullmatch(expected[name]), 'EXPECTED_DIGEST')
    require(type(expected['policy_epoch']) is int and 0 <= expected['policy_epoch'] < 2**53, 'EXPECTED_EPOCH')
    require(type(expected['max_body_bytes']) is int and 1024 <= expected['max_body_bytes'] <= 65536, 'EXPECTED_LIMIT')
    require(expected['wire_profile'] == 'sf.sewe.packet-envelope.v1', 'WIRE_PROFILE_UNSUPPORTED')
    kit, code_sources, package_root = load_kit(config['kit_root'], config['kit_code_pins'])
    models, codec, permits = kit['models'], kit['codec'], kit['permits']
    now_text = lambda: datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    utc = codec.utc_seconds
    require(utc(expected['expires_utc']) > utc(now_text()), 'BINDING_EXPIRED')
    pinned = {}
    def read(name, limit):
        descriptor = config[name]
        value = read_file(descriptor['path'], descriptor['sha256'], limit)
        pinned[name] = value
        return value
    def current():
        raw = read_file(config['current']['path'], None, 16384)
        value = codec.strict_loads(raw)
        require(exact(value, CURRENT_KEYS), 'CURRENT_SHAPE')
        require(all(value[name] is True for name in ('active', 'grant_active', 'review_active', 'key_active'))
                and value['revoked'] is False, 'CURRENT_REVOKED')
        for name in ('grant_ref', 'release_ref', 'project_ref', 'scope_ref', 'audience', 'model_id',
                     'review_ref', 'permit_id', 'key_id', 'policy_epoch'):
            require(type(value[name]) is type(expected[name]) and value[name] == expected[name], 'CURRENT_BINDING')
        now = utc(now_text())
        require(utc(value['issued_utc']) <= utc(value['observed_utc']) <= now < utc(value['expires_utc'])
                and now-utc(value['observed_utc']) <= 300, 'CURRENT_EXPIRED')
        return value, raw
    current_value, current_raw = current()
    prepared = codec.decode(models.PreparedRequest, read('prepared', 32768))
    review = codec.decode(models.PolicyReview, read('review', 32768))
    permit = codec.decode(models.SignedPermit, read('permit', 16384))
    route = codec.decode(models.RouteProfile, read('route', 16384))
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    public_raw = read('public_key', 32)
    require(len(public_raw) == 32, 'PUBLIC_KEY_SHAPE')
    public_key = Ed25519PublicKey.from_public_bytes(public_raw)
    require(permit.key_id == expected['key_id'] and permit.claims.permit_id == expected['permit_id'], 'PERMIT_IDENTITY')
    # Authenticate claims before reading the released body. Only the real E14
    # verifier below can bind the signature to the body bytes actually read.
    public_key.verify(bytes.fromhex(permit.signature_hex), codec.canonical(permit.claims))
    require(prepared.body.classification == 'RELEASED' and prepared.body.media_type == 'application/json', 'NOT_RELEASED')
    require(prepared.body.sha256 == config['released_body']['sha256'] and prepared.body.byte_length <= expected['max_body_bytes'], 'BODY_BINDING')
    require(route.data_class == 'RELEASED' and route.profile_id == expected['route_profile_id']
            and route.model_id == expected['model_id'] and codec.digest(route) == expected['route_sha256']
            and prepared.route_sha256 == expected['route_sha256']
            and prepared.header_profile_sha256 == expected['header_profile_sha256'], 'ROUTE_BINDING')
    require(review.decision == 'ALLOW' and review.review_ref == expected['review_ref'] == prepared.review_ref
            and review.actor_ref == expected['reviewer_ref'] and review.scope_digest == expected['scope_digest']
            and review.work_digest == expected['work_digest'] and review.packet_digest == prepared.packet_sha256
            and review.policy_epoch == expected['policy_epoch'] and utc(review.expires_utc) > utc(now_text()), 'REVIEW_REQUIRED')
    claims = permit.claims
    require(claims.request_sha256 == prepared.body.sha256 and claims.route_sha256 == prepared.route_sha256
            and claims.job_id == prepared.job_id and claims.mission_id == prepared.mission_id and claims.round == prepared.round
            and claims.review_ref == review.review_ref and claims.policy_epoch == expected['policy_epoch']
            and claims.audience == expected['audience'] and type(claims.max_uses) is int and claims.max_uses == 1
            and utc(claims.issued_utc) <= utc(now_text()) < utc(claims.expires_utc), 'PERMIT_BINDING')
    require(current()[1] == current_raw, 'CURRENT_CHANGED')
    body = read('released_body', min(route.max_request_bytes, expected['max_body_bytes']))
    require(len(body) == prepared.body.byte_length, 'BODY_LENGTH')
    def verify():
        permits.verify_permit(permit, {expected['key_id']: public_key}, body, expected['route_sha256'],
                              prepared.job_id, prepared.mission_id, prepared.round, review.review_ref,
                              expected['policy_epoch'], expected['audience'], now_text())
    verify()
    wire = codec.strict_loads(body)
    require(exact(wire, ('packet', 'released_history')) and wire['released_history'] == [], 'WIRE_SHAPE')
    packet = codec.decode(models.WorkPacket, codec.canonical(wire['packet']))
    require(codec.digest(packet) == prepared.packet_sha256 == review.packet_digest
            and packet.mission_id == prepared.mission_id and packet.round == prepared.round
            and packet.work_type == expected['work_type'] and packet.work_revision == expected['work_revision'], 'PACKET_BINDING')
    # Revalidate every byte of authority and released input; no stale import,
    # revocation snapshot, reviewed revision or body replacement survives return.
    read_file(binding_path, binding_sha256, 65536)
    for name, raw in pinned.items():
        require(read_file(config[name]['path'], config[name]['sha256'], len(raw)) == raw, 'INPUT_CHANGED')
    for name, raw in code_sources.items():
        require(read_file(str(package_root/name), config['kit_code_pins'][name], len(raw)) == raw, 'KIT_CHANGED')
    require(current()[1] == current_raw, 'CURRENT_CHANGED')
    require(utc(review.expires_utc) > utc(now_text()) and utc(expected['expires_utc']) > utc(now_text()), 'REVIEW_EXPIRED')
    verify()
    expiry = min((expected['expires_utc'], current_value['expires_utc'], review.expires_utc, claims.expires_utc), key=utc)
    result = {'status': 'VERIFIED_RELEASE', 'packet': packet.model_dump(mode='json'), 'release': {
        'ref': expected['release_ref'], 'grant_ref': expected['grant_ref'], 'body_sha256': sha(body),
        'packet_sha256': codec.digest(packet), 'prepared_sha256': sha(pinned['prepared']),
        'review_sha256': sha(pinned['review']), 'permit_sha256': sha(pinned['permit']),
        'review_ref': review.review_ref, 'permit_ref': claims.permit_id, 'audience': expected['audience'],
        'project_ref': expected['project_ref'], 'scope_ref': expected['scope_ref'], 'scope_digest': expected['scope_digest'],
        'work_digest': expected['work_digest'], 'work_type': packet.work_type, 'work_revision': packet.work_revision,
        'model_id': route.model_id, 'live_enabled': route.live_enabled, 'route_sha256': prepared.route_sha256,
        'header_profile_sha256': prepared.header_profile_sha256, 'policy_epoch': expected['policy_epoch'],
        'key_ref': permit.key_id, 'public_key_sha256': sha(public_raw), 'binding_sha256': binding_sha256,
        'current_sha256': sha(current_raw), 'observed_utc': now_text(), 'expires_utc': expiry}}
    require(len(codec.canonical(result)) <= 98304, 'OUTPUT_LIMIT')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binding', required=True)
    parser.add_argument('--sha256', required=True)
    args = parser.parse_args()
    try:
        value = verify_release(args.binding, args.sha256)
    except Exception:
        print('{"status":"HOLD","code":"WORK_INTAKE_RELEASE_UNVERIFIED"}')
        return 1
    print(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
