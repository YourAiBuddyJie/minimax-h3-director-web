/** Only the service address belongs to the connection; all run fields belong to the project. */
export function resetProjectExecution(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  let url = 'http://127.0.0.1:8189';
  try {
    const saved = JSON.parse(storage.getItem('h3-director-run') || '{}');
    if (typeof saved.url === 'string' && saved.url.trim()) url = saved.url;
  } catch { /* Reset damaged project state as well. */ }
  storage.removeItem('h3-director-checkpoints');
  storage.setItem('h3-director-run', JSON.stringify({ url }));
}
