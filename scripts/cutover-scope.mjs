import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const api = join(fileURLToPath(import.meta.url), "..", "..", "src", "pages", "api");
const re = /from\s+["'][^"']*lib\/store(\.js)?["']/;

const files = [];
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!p.endsWith(".ts")) continue;
    if (re.test(readFileSync(p, "utf8"))) files.push(p);
  }
}
walk(api);

const groups = new Map();
for (const f of files) {
  const rel = f.slice(api.length + 1);
  const head = rel.split(sep)[0];
  const key = head.endsWith(".ts") ? rel.slice(0, -3) : head;
  groups.set(key, (groups.get(key) ?? 0) + 1);
}

const rows = [...groups.entries()].sort((a, b) => b[1] - a[1]);
if (process.argv.includes("--files")) {
  for (const f of files.sort()) process.stdout.write(`${f.slice(api.length + 1)}\n`);
  process.exit(0);
}
for (const [k, n] of rows) process.stdout.write(`${String(n).padStart(4)}  ${k}\n`);
process.stdout.write(`----\n${String(files.length).padStart(4)}  TOTAL con lib/store\n`);
