import { execSync } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cmd) => {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

let base = process.argv[2] || '';
if (!base) {
  const mb = git('git merge-base HEAD origin/main');
  base = mb || 'HEAD';
}
const head = git('git rev-parse --short HEAD') || 'worktree';
const diff = git(`git diff --name-status ${base}...HEAD`);
const untracked = git('git ls-files --others --exclude-standard');
const files = new Set();
for (const line of diff.split('\n')) {
  const f = line.split(/\s+/).pop();
  if (f) files.add(f);
}
for (const f of untracked.split('\n')) if (f) files.add(f);

const visual = [...files].filter((f) => f.startsWith('src/') && /\.(astro|css)$/.test(f));
process.stdout.write(`Target: worktree\nBase: ${base}\nHead: ${head}\nArchivos visuales en scope: ${visual.length}\n`);
for (const f of visual) {
  process.stdout.write(`- ${f}\n`);
  if (f.startsWith('src/components/')) {
    const name = basename(f).replace(/\.(astro|css)$/, '');
    const hit = git(`git grep -l "${name}" -- src/components src/layouts src/pages`);
    const importers = hit.split('\n').filter((h) => h && h !== f).slice(0, 5);
    for (const h of importers) process.stdout.write(`  importado por ${h}\n`);
  }
}
if (!visual.length) process.stdout.write('Sin cambios visuales: el gate no aplica.\n');
