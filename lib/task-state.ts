export function acceptedTaskId(value: { promptId?: unknown }): string {
  if (typeof value.promptId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(value.promptId)) {
    throw new Error('服务未返回有效任务ID，提交结果未知；请先核对 Director 队列，勿重复提交。');
  }
  return value.promptId;
}

export function historyTaskStatus(status?: { status_str?: string; completed?: boolean }) {
  if (status?.status_str === 'error') return 'error';
  return status?.completed === true || status?.status_str === 'success' ? 'completed' : 'running';
}
