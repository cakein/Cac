import { copyFileSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './sites-env.mjs';

try {
  copyFileSync('.env.example', '.dev.vars', constants.COPYFILE_EXCL);
  console.log('Created local environment settings in .dev.vars.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping your existing local environment settings.');
}

const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const result = spawnSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--config', 'wrangler.local.jsonc'], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Local database ready. Start HabitLab with pnpm dev.');
