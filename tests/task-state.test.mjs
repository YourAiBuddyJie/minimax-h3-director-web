import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedTaskId, historyTaskStatus } from '../lib/task-state.ts';
import { decideAutomaticAction } from '../lib/automatic-review.ts';

test('partial history outputs cannot complete a task before the execution status does', () => {
  assert.equal(historyTaskStatus(undefined), 'running');
  assert.equal(historyTaskStatus({ completed: false, status_str: 'running' }), 'running');
  assert.equal(historyTaskStatus({ completed: true }), 'completed');
  assert.equal(historyTaskStatus({ status_str: 'success' }), 'completed');
  assert.equal(historyTaskStatus({ completed: true, status_str: 'error' }), 'error');
});
test('successful HTTP submission without a task ID must remain uncertain', () => {
  for (const promptId of [undefined, null, '', 12, 'bad/id']) assert.throws(() => acceptedTaskId({promptId}), /任务ID/);
  assert.equal(acceptedTaskId({promptId:'fixture-id-123'}), 'fixture-id-123');
});
test('join failures stop automatic flow; active join waits and only completed join finishes', () => {
  const input = { enabled:true, busy:false, blocked:false, next:3, count:3, joined:false };
  assert.equal(decideAutomaticAction(input), 'join');
  for (const joinStatus of ['error', 'uncertain']) assert.equal(decideAutomaticAction({...input,joinStatus}), 'stop');
  for (const joinStatus of ['pending', 'running']) assert.equal(decideAutomaticAction({...input,joinStatus}), 'wait');
  assert.equal(decideAutomaticAction({...input,joinStatus:'completed'}), 'done');
});
