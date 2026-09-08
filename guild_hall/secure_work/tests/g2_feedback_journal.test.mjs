import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {assertCompletedPublicationJournal} from '../g2_feedback_publisher.mjs';

const kit=process.env.SOULFORGE_SECURE_WORK_KIT_ROOT, python=process.env.SOULFORGE_FEEDBACK_TEST_PYTHON,
  site=process.env.SOULFORGE_FEEDBACK_TEST_SITE_PACKAGES;
test('pre-reservation gate refuses retained missing, empty and partial actual E14 journal without rebuilding it',
  {skip:![kit,python,site].every(p=>p&&path.isAbsolute(p))}, async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'g2-feedback-journal-'));
    t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^g2-feedback-journal-/u);await fs.rm(root,{recursive:true,force:true});});
    const database=path.join(root,'attempts.db'), job='o_'+'1'.repeat(32), permit='o_'+'2'.repeat(32), attempt='o_'+'3'.repeat(32), body='a'.repeat(64);
    const code="import sys;sys.path[:0]=[sys.argv[1]+'/src',sys.argv[2]];from sf_sewe.journal import Journal;j=Journal(sys.argv[3]);j.create(sys.argv[4],'project:SYN','feedback.code');j.reserve_attempt(sys.argv[5],sys.argv[4],sys.argv[6],sys.argv[7]);j.mark_attempt(sys.argv[5],'IN_FLIGHT');j.mark_attempt(sys.argv[5],'RESPONSE_RECEIVED');j.close()";
    execFileSync(python,['-I','-S','-B','-c',code,kit,site,database,job,attempt,permit,body],{windowsHide:true,stdio:'pipe'});
    const expected={attempt_id:attempt,permit_id:permit,body_sha256:body,scope_ref:'project:SYN',job_id:null};
    await assertCompletedPublicationJournal(root,expected);
    const original=await fs.readFile(database);
    await fs.truncate(database,0);
    await assert.rejects(assertCompletedPublicationJournal(root,expected));
    assert.equal((await fs.stat(database)).size,0);
    await fs.writeFile(database,original);
    const db=new DatabaseSync(database);db.exec('DROP TABLE attempts');db.close();
    await assert.rejects(assertCompletedPublicationJournal(root,expected));
    const readonly=new DatabaseSync(database,{readOnly:true});assert.equal(readonly.prepare("SELECT name FROM sqlite_master WHERE name='attempts'").get(),undefined);readonly.close();
    await fs.rm(database);
    await assert.rejects(assertCompletedPublicationJournal(root,expected),{code:'ENOENT'});
    await assert.rejects(fs.stat(database),{code:'ENOENT'});
  });
