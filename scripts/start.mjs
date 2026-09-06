import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const localEnv = resolve(projectRoot, '.env.local');

if (!existsSync(localEnv)) {
  copyFileSync(resolve(projectRoot, '.env.example'), localEnv);
  console.log('已创建 .env.local；OPENAI_API_KEY 留空时使用离线规则模式。');
}

const wrangler = resolve(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const child = spawn(process.execPath, [wrangler,
  'dev',
  '--config', resolve(projectRoot, 'dist', 'server', 'wrangler.json'),
  '--env-file', localEnv,
  '--port', '3000',
  '--ip', '127.0.0.1',
], { cwd: projectRoot, stdio: 'inherit' });

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
