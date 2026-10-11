import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import hostingConfig from './.openai/hosting.json' with { type: 'json' };

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      {
        name: 'local-director-output-recovery',
        configureServer(server: ViteDevServer) {
          server.middlewares.use('/__local/director-output-index', async (req: IncomingMessage, res: ServerResponse) => {
            if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
            try {
              const root = process.env.DIRECTOR_OUTPUT_DIR || 'D:/AI/ComfyUI-H3/director_test/ComfyUI/output';
              const [videos, frames] = await Promise.all([readdir(path.join(root, 'h3-director-web/director')), readdir(path.join(root, 'h3-director-web/checkpoints'))]);
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Cache-Control', 'no-store');
              let recoveryPlan;
              try { recoveryPlan = JSON.parse(await readFile(path.resolve('.local-run-logs/recovery-plan.json'), 'utf8')); } catch { /* no explicit recovery plan */ }
              res.end(JSON.stringify({ videos, frames, recoveryPlan }));
            } catch { res.statusCode = 404; res.end('Local Director output not found'); }
          });
        },
      },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
