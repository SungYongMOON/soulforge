"""Adapt the existing public E14 test-vector owner; never load operational keys."""
import sys
sys.dont_write_bytecode = True
import argparse
import importlib.util
import json
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kit-root', required=True)
    parser.add_argument('--request', required=True)
    args = parser.parse_args()
    request = json.loads(Path(args.request).read_text(encoding='utf-8'))
    os.environ['WORK_INTAKE_TEST_KIT_ROOT'] = args.kit_root
    owner_path = Path(__file__).resolve().parents[1] / 'test_work_intake_packet_reader.py'
    spec = importlib.util.spec_from_file_location('company_intake_public_vector_owner', owner_path)
    owner = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = owner
    spec.loader.exec_module(owner)
    cls = owner.E14ReleasedPacketTests
    cls.setUpClass()
    fixture = cls(methodName='test_real_ed25519_typed_release_and_actual_cli_output')
    fixture.setUp()
    try:
        fixture.packet['facts'] = request['facts']
        fixture.packet['sections'][0]['required_fact_ids'] = [fact['fact_id'] for fact in request['facts']]
        fixture.route['model_id'] = request['model_id']
        fixture.wire['packet'] = fixture.packet
        body = fixture.codec.canonical(fixture.wire)
        packet_digest = fixture.codec.digest(fixture.packet)
        route_digest = fixture.codec.digest(fixture.route)
        fixture.review.update(scope_digest=request['scope_digest'], packet_digest=packet_digest)
        fixture.prepared.update(packet_sha256=packet_digest, route_sha256=route_digest)
        fixture.prepared['body'].update(sha256=owner.reader.sha(body), byte_length=len(body))
        fixture.claims.update(request_sha256=owner.reader.sha(body), route_sha256=route_digest, audience=request['audience'])
        fixture.config['expected'].update(project_ref=request['project_ref'], scope_ref=request['scope_ref'],
            grant_ref=request['grant_ref'], scope_digest=request['scope_digest'], audience=request['audience'],
            model_id=request['model_id'], route_sha256=route_digest)
        fixture.config['writable_roots'] = request['writable_roots']
        fixture.current.update(project_ref=request['project_ref'], scope_ref=request['scope_ref'],
            grant_ref=request['grant_ref'], audience=request['audience'], model_id=request['model_id'])
        fixture.current_path.write_bytes(fixture.codec.canonical(fixture.current))
        for name, value in [('released_body', fixture.wire), ('prepared', fixture.prepared),
                            ('review', fixture.review), ('route', fixture.route)]:
            fixture.save(name, value)
        fixture.resign()
        fixture.seal()
        verified = fixture.verify()
        result = {'root': str(fixture.root), 'bindingPath': str(fixture.binding_path),
            'bindingSha256': fixture.binding_sha, 'currentPath': str(fixture.current_path),
            'config': fixture.config, 'current': fixture.current, 'packet': fixture.packet,
            'release': verified['release']}
        # The Node fixture owns these exact synthetic roots until its close().
        fixture.temp._finalizer.detach()
        print(json.dumps(result))
    except BaseException:
        fixture.tearDown()
        raise


if __name__ == '__main__':
    main()
