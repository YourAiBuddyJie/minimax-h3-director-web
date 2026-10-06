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
let child;
let restartTimer;
let stopping = false;

function startServer() {
  child = spawn(process.execPath, [wrangler,
    'dev',
    '--config', resolve(projectRoot, 'dist', 'server', 'wrangler.json'),
    '--env-file', localEnv,
    '--port', '3000',
    '--ip', '127.0.0.1',
  ], { cwd: projectRoot, stdio: 'inherit' });

  child.on('error', (error) => console.error('导演台服务启动失败：', error));
  child.on('exit', (code, signal) => {
    child = undefined;
    if (stopping) return;
    console.error(`导演台服务意外退出（${signal || code}），1.5 秒后自动重启。`);
    restartTimer = setTimeout(startServer, 1500);
  });
}

function stopServer() {
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  child?.kill();
}

process.on('SIGINT', stopServer);
process.on('SIGTERM', stopServer);
startServer();
