"""Synthetic working-store boundaries; no existing project metadata is read."""
import json
import os
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from soulforge_secure_work import engine, plan, storage


def bare_lane(tmp_path):
    root = tmp_path / 'jobs'
    root.mkdir()
    lane = engine.Lane.__new__(engine.Lane)
    lane.config = SimpleNamespace(jobs_root=root)
    return lane


def test_job_reference_cannot_read_outside_working_store(tmp_path):
    lane = bare_lane(tmp_path)
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'job.json').write_text(json.dumps({'job_id': '../outside', 'marker': 'public synthetic outside'}))
    with pytest.raises(engine.EngineStop):
        lane.load_job('../outside')


@pytest.mark.parametrize('identifier', ['..', '/absolute', 'a/../b', 'a\\b', 'a:stream', 'CON', 'name.'])
def test_unsafe_job_reference_is_rejected_before_filesystem_lookup(tmp_path, identifier):
    lane = bare_lane(tmp_path)
    with patch.object(Path, 'is_file', side_effect=AssertionError('unsafe lookup occurred')):
        with pytest.raises(engine.EngineStop):
            lane.load_job(identifier)


def test_recipe_reference_cannot_escape_approved_recipe_root(tmp_path):
    root = tmp_path / 'recipes'
    root.mkdir()
    (tmp_path / 'outside.json').write_text(json.dumps({'recipe_id': '../outside', 'required_sections': ['facts']}))
    with pytest.raises(RuntimeError):
        plan.load_recipe(root, '../outside')


def test_same_second_requests_do_not_overwrite_an_existing_job(hermetic_lane):
    lane = hermetic_lane
    with patch.object(engine, '_now', return_value='2026-09-08T00:00:00Z'):
        first = lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'same mission')
        first.data['round'] = 7
        first.save()
        before = first.path('job.json').read_bytes()
        try:
            second = lane.request('TEST-R1', lane.config.source_root, 'test.requester', 'same mission')
        except Exception:
            assert first.path('job.json').read_bytes() == before
            raise
        assert first.path('job.json').read_bytes() == before
        assert second.job_id != first.job_id


def stored_job(lane, identifier='job.synthetic', **changes):
    data = {'schema': engine.JOB_SCHEMA, 'job_id': identifier,
            'mission_id': 'mission.synthetic', 'recipe_id': 'TEST-R0',
            'project_ref': 'project.synthetic', 'assignment_ref': 'assignment.synthetic',
            'assignment_epoch': 1, 'task_ref': 'task.synthetic', 'policy_epoch': 1,
            'round': 0, 'route_sha256': 'a' * 64, 'transport_id': 'scripted.subprocess'}
    data.update(changes)
    root = lane.config.jobs_root / identifier
    root.mkdir()
    (root / 'job.json').write_text(json.dumps(data), encoding='utf-8')
    # No SQLite payload is read by the metadata-only load tests.
    (root / 'journal.db').write_bytes(b'public synthetic nonempty journal stand-in')
    return root, data


def proof(data):
    return {**engine.job_scope(SimpleNamespace(data=data)), 'principal_ref': 'principal.synthetic',
            'purpose': 'SOURCE', 'issuer_key_id': 'issuer.synthetic', 'expires_at': 9999999999999}


@pytest.mark.parametrize('identifier', ['o_' + 'a' * 32, 'job.synthetic', 'JOB-legacy_07'])
def test_existing_safe_ascii_job_ids_remain_readable(tmp_path, identifier):
    lane = bare_lane(tmp_path)
    _, data = stored_job(lane, identifier)
    with patch.object(engine, 'role_entry', return_value=proof(data)), \
         patch.object(engine, 'role_check', return_value=proof(data)) as check:
        assert lane.load_job(identifier).data == data
    check.assert_called_with('jobs.get', engine.job_scope(SimpleNamespace(data=data)))


@pytest.mark.parametrize('operation', ['jobs.get', 'jobs.advance', 'release.issue', 'release.review'])
def test_current_role_denial_precedes_any_job_bytes(tmp_path, operation):
    lane = bare_lane(tmp_path)
    with patch.object(engine, 'role_entry', side_effect=RuntimeError('SECURE_WORK_ROLE_HOLD')) as entry, \
         patch.object(storage, 'read_bytes', side_effect=AssertionError('read before role')) as read:
        with pytest.raises(engine.EngineStop, match='JOB_SCOPE_HOLD'):
            lane.load_job('job.synthetic', operation=operation)
    entry.assert_called_once_with(operation)
    read.assert_not_called()


@pytest.mark.parametrize('field', ['project_ref', 'assignment_ref', 'assignment_epoch', 'task_ref',
                                  'policy_epoch', 'route_sha256', 'transport_id'])
def test_foreign_or_missing_scope_never_returns_job_or_reads_its_payload(tmp_path, field):
    lane = bare_lane(tmp_path)
    root, data = stored_job(lane)
    trusted = proof(data)
    foreign = dict(data)
    foreign[field] = 2 if field.endswith('epoch') else 'foreign.synthetic'
    (root / 'job.json').write_text(json.dumps(foreign), encoding='utf-8')
    with patch.object(engine, 'role_entry', return_value=trusted), \
         patch.object(engine, 'role_check', side_effect=AssertionError('foreign scope reached authorization')):
        with pytest.raises(engine.EngineStop, match='JOB_SCOPE_HOLD'):
            lane.load_job(root.name)
    foreign.pop(field)
    (root / 'job.json').write_text(json.dumps(foreign), encoding='utf-8')
    with patch.object(engine, 'role_entry', return_value=trusted):
        with pytest.raises(engine.EngineStop):
            lane.load_job(root.name)


def test_current_scope_is_rechecked_before_return(tmp_path):
    lane = bare_lane(tmp_path)
    _, data = stored_job(lane)
    with patch.object(engine, 'role_entry', return_value=proof(data)), \
         patch.object(engine, 'role_check', side_effect=RuntimeError('SECURE_WORK_ROLE_HOLD')):
        with pytest.raises(engine.EngineStop, match='JOB_SCOPE_HOLD'):
            lane.load_job(data['job_id'])


@pytest.mark.parametrize('operation', ['release.issue', 'release.review'])
def test_reviewer_reads_use_current_reviewer_entry_then_exact_job_scope(tmp_path, operation):
    lane = bare_lane(tmp_path)
    _, data = stored_job(lane)
    calls = []
    def entry(actual):
        calls.append(('entry', actual))
        return proof(data)
    def check(actual, scope):
        calls.append(('scope', actual, scope))
        return proof(data)
    with patch.object(engine, 'role_entry', side_effect=entry), patch.object(engine, 'role_check', side_effect=check):
        assert lane.load_job(data['job_id'], operation=operation).job_id == data['job_id']
    assert calls == [('entry', operation), ('scope', operation, engine.job_scope(SimpleNamespace(data=data)))]


@pytest.mark.parametrize('body', [b'not json: public synthetic marker', b'[]', b'{"schema":1,"schema":2}',
                                  b'{"schema":NaN}', b'\xff', b'[' * 2000 + b']' * 2000])
def test_corrupt_metadata_holds_without_echo_or_repair(tmp_path, body):
    lane = bare_lane(tmp_path)
    root, _ = stored_job(lane)
    target = root / 'job.json'
    target.write_bytes(body)
    with pytest.raises(engine.EngineStop) as result:
        lane.load_job(root.name)
    assert str(result.value) == 'JOB_STORE_HOLD'
    assert target.read_bytes() == body


def test_oversize_metadata_is_refused_before_open(tmp_path):
    lane = bare_lane(tmp_path)
    root, _ = stored_job(lane)
    (root / 'job.json').write_bytes(b'x' * (engine.JOB_MAXIMUM_BYTES + 1))
    with patch.object(storage.os, 'open', side_effect=AssertionError('oversize opened')):
        with pytest.raises(engine.EngineStop):
            lane.load_job(root.name)


@pytest.mark.parametrize('kind', ['job', 'recipe'])
def test_hardlink_metadata_is_refused_before_open(tmp_path, kind):
    root = tmp_path / 'store'
    root.mkdir()
    outside = tmp_path / 'outside.json'
    outside.write_bytes(b'{"public":"synthetic"}')
    if kind == 'job':
        (root / 'job.synthetic').mkdir()
        target = root / 'job.synthetic' / 'job.json'
        lane = engine.Lane.__new__(engine.Lane)
        lane.config = SimpleNamespace(jobs_root=root)
        call = lambda: lane.load_job('job.synthetic')
    else:
        target = root / 'TEST.json'
        call = lambda: plan.load_recipe(root, 'TEST')
    os.link(outside, target)
    with patch.object(storage.os, 'open', side_effect=AssertionError('hardlink opened')):
        with pytest.raises(RuntimeError):
            call()
    assert outside.read_bytes() == b'{"public":"synthetic"}'


@pytest.mark.parametrize('at_root', [False, True])
def test_symlink_directory_is_refused_before_file_open(tmp_path, at_root):
    outside = tmp_path / 'outside'
    outside.mkdir()
    root = tmp_path / 'jobs'
    target = root if at_root else root / 'job.synthetic'
    if not at_root:
        root.mkdir()
    try:
        target.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip('OS does not permit synthetic symlink creation')
    lane = engine.Lane.__new__(engine.Lane)
    lane.config = SimpleNamespace(jobs_root=root)
    with patch.object(storage.os, 'open', side_effect=AssertionError('alias opened')):
        with pytest.raises(engine.EngineStop):
            lane.load_job('job.synthetic')


@pytest.mark.skipif(os.name != 'nt', reason='Windows reparse/alias semantics')
@pytest.mark.parametrize('surface', ['jobs_root', 'job_directory', 'recipe_root'])
def test_windows_junction_is_refused_before_file_open(tmp_path, surface):
    import _winapi
    outside = tmp_path / 'outside'
    outside.mkdir()
    root = tmp_path / 'store'
    if surface == 'job_directory':
        root.mkdir()
        target = root / 'job.synthetic'
    else:
        target = root
    _winapi.CreateJunction(str(outside), str(target))
    lane = engine.Lane.__new__(engine.Lane)
    lane.config = SimpleNamespace(jobs_root=root)
    with patch.object(storage.os, 'open', side_effect=AssertionError('junction opened')):
        with pytest.raises(RuntimeError):
            plan.load_recipe(root, 'TEST') if surface == 'recipe_root' else lane.load_job('job.synthetic')


@pytest.mark.skipif(os.name != 'nt', reason='Windows case-insensitive alias semantics')
def test_case_alias_is_rejected_without_changing_existing_identifier(tmp_path):
    lane = bare_lane(tmp_path)
    stored_job(lane, 'job.MixedCase')
    with patch.object(storage.os, 'open', side_effect=AssertionError('case alias opened')):
        with pytest.raises(engine.EngineStop):
            lane.load_job('job.mixedcase')


def test_file_replacement_between_metadata_check_and_open_is_not_read(tmp_path):
    root = tmp_path / 'store'
    root.mkdir()
    target = root / 'job.json'
    target.write_bytes(b'{"public":"first synthetic"}')
    replacement = root / 'replacement.json'
    replacement.write_bytes(b'{"public":"second synthetic"}')
    real_open = storage.os.open
    def replace_then_open(path, flags):
        os.replace(replacement, target)
        return real_open(path, flags)
    with patch.object(storage.os, 'open', side_effect=replace_then_open):
        with pytest.raises(storage.StorageHold, match='STORE_CHANGED_HOLD'):
            storage.read_bytes(root, 'job.json', maximum=1024)


@pytest.mark.parametrize('contents', ['empty_directory', 'missing_journal', 'corrupt_job'])
def test_list_and_status_hold_partial_store_instead_of_reporting_zero(tmp_path, contents):
    lane = bare_lane(tmp_path)
    root, _ = stored_job(lane)
    if contents == 'empty_directory':
        (root / 'job.json').unlink()
        (root / 'journal.db').unlink()
    elif contents == 'missing_journal':
        (root / 'journal.db').unlink()
    else:
        (root / 'job.json').write_bytes(b'broken public synthetic metadata')
    for call in (lane.list_jobs, lane.refresh_status):
        with pytest.raises(engine.EngineStop):
            call()
    assert not (root / 'journal.db').exists() if contents != 'corrupt_job' else True


def test_list_checks_scope_for_each_job_and_empty_list_still_checks_authority(tmp_path):
    lane = bare_lane(tmp_path)
    with patch.object(engine, 'role_entry', side_effect=RuntimeError('SECURE_WORK_ROLE_HOLD')):
        with pytest.raises(RuntimeError):
            lane.list_jobs()
    _, data = stored_job(lane, 'job.allowed')
    stored_job(lane, 'job.foreign', project_ref='project.foreign')
    with patch.object(engine, 'role_entry', return_value=proof(data)), \
         patch.object(engine, 'role_check', return_value=proof(data)):
        with pytest.raises(engine.EngineStop, match='JOB_SCOPE_HOLD'):
            lane.list_jobs()


def test_forced_id_collision_preserves_existing_and_partial_directory(hermetic_lane):
    lane = hermetic_lane
    first = lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    before = {p.name: p.read_bytes() for p in first.root.iterdir() if p.is_file()}
    with patch.object(engine.uuid, 'uuid4', return_value=SimpleNamespace(hex=first.job_id[2:])):
        with pytest.raises(engine.EngineStop, match='JOB_EXISTS_HOLD'):
            lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    assert {p.name: p.read_bytes() for p in first.root.iterdir() if p.is_file()} == before
    partial_id = 'o_' + 'e' * 32
    partial = lane.config.jobs_root / partial_id
    partial.mkdir()
    with patch.object(engine.uuid, 'uuid4', return_value=SimpleNamespace(hex=partial_id[2:])):
        with pytest.raises(engine.EngineStop, match='JOB_EXISTS_HOLD'):
            lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    assert list(partial.iterdir()) == []


def test_loaded_job_save_refuses_changed_bytes_and_hardlink_target(hermetic_lane, tmp_path):
    lane = hermetic_lane
    job = lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    target = job.path('job.json')
    changed = b'public synthetic corruption'
    target.write_bytes(changed)
    with pytest.raises(engine.EngineStop):
        job.save()
    assert target.read_bytes() == changed
    other = tmp_path / 'linked.json'
    os.link(target, other)
    with pytest.raises(engine.EngineStop):
        job.save()
    assert other.read_bytes() == changed


def test_status_omits_foreign_previous_pointer_and_receipt_tree(hermetic_lane):
    lane = hermetic_lane
    lane.config.status_path.write_text(json.dumps({'schema': engine.STATUS_SCHEMA,
        'last_job': 'foreign.synthetic', 'last_receipt_ref': 'foreign.synthetic/001_submit.json'}))
    foreign = lane.config.receipts_root / 'foreign.synthetic'
    foreign.mkdir()
    (foreign / '001_submit.json').write_bytes(b'public synthetic receipt')
    status = lane.refresh_status()
    assert status['jobs'] == {} and status['last_job'] is None and status['last_receipt_ref'] is None


@pytest.mark.parametrize('damage', ['missing_table', 'wrong_project', 'wrong_recipe', 'invalid_sqlite'])
def test_status_never_repairs_or_returns_a_damaged_journal(hermetic_lane, damage):
    lane = hermetic_lane
    job = lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    path = job.path('journal.db')
    if damage == 'invalid_sqlite':
        path.write_bytes(b'public synthetic corrupt journal')
    else:
        with sqlite3.connect(path) as db:
            db.execute({'missing_table': 'DROP TABLE attempts',
                        'wrong_project': "UPDATE jobs SET project_ref='foreign.synthetic'",
                        'wrong_recipe': "UPDATE jobs SET work_type='foreign.synthetic'"}[damage])
    before = path.read_bytes()
    status_before = lane.config.status_path.read_bytes()
    with pytest.raises(engine.EngineStop, match='JOB_STATUS_HOLD'):
        lane.refresh_status()
    assert path.read_bytes() == before
    assert lane.config.status_path.read_bytes() == status_before


def test_normal_journal_status_read_does_not_modify_existing_bytes(hermetic_lane):
    lane = hermetic_lane
    job = lane.request('TEST-R0', lane.config.source_root, 'test.requester', 'synthetic mission')
    path = job.path('journal.db')
    before = path.read_bytes()
    assert lane.phase(job) == 'RECEIVED'
    assert lane.refresh_status()['jobs'] == {'RECEIVED': 1}
    assert path.read_bytes() == before


def test_status_refuses_a_changed_current_context_at_return(hermetic_lane):
    lane = hermetic_lane
    empty_proof = {'project_ref': 'project.synthetic'}
    # Empty-store listing, pre-write and return each check current authority.
    with patch.object(engine, 'role_entry', side_effect=[empty_proof, empty_proof, empty_proof,
                                                        {'project_ref': 'project.changed'}]):
        with pytest.raises(engine.EngineStop, match='JOB_SCOPE_HOLD'):
            lane.refresh_status()


def test_approved_recipe_normal_case_and_corrupt_sections(tmp_path):
    root = tmp_path / 'recipes'
    root.mkdir()
    data = {'recipe_id': 'R1-07', 'required_sections': ['facts', 'changes']}
    target = root / 'R1-07.json'
    target.write_text(json.dumps(data))
    assert plan.load_recipe(root, 'R1-07') == data
    data['required_sections'] = ['facts', 'facts']
    target.write_text(json.dumps(data))
    with pytest.raises(RuntimeError, match='RECIPE_STORE_HOLD'):
        plan.load_recipe(root, 'R1-07')
