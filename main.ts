import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

// This compilation script gathers all application assets and prepares the static frontend bundle for deployment.
// It then invokes the official make.fun dossier generator to produce the compliance summary required for submission.

const sourceDir = fileURLToPath(new URL('.', import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(targetDir, { recursive: true });
cpSync(join(sourceDir, 'app'), join(targetDir, 'app'), { recursive: true });

mkdirSync(join(targetDir, 'screenshots'), { recursive: true });
const localScreenshots = join(sourceDir, 'screenshots');
if (existsSync(localScreenshots)) {
  cpSync(localScreenshots, join(targetDir, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(targetDir, 'dossier.json'),
  buildDossier(targetDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648
  })
);
