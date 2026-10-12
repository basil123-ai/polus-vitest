/**
 * Fails if executable lines added/changed vs a git base are under the coverage threshold.
 * Existing untouched code is ignored. Specs and test wiring are ignored.
 *
 * Usage:
 *   npm run test:coverage
 *   node scripts/check-patch-coverage.mjs
 *
 * Env:
 *   PATCH_COVERAGE_BASE        git ref to diff against (default: origin/main)
 *   PATCH_COVERAGE_THRESHOLD   percent, default 80
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const THRESHOLD = Number(process.env.PATCH_COVERAGE_THRESHOLD || 80);
const BASE = process.env.PATCH_COVERAGE_BASE || 'origin/main';
const COVERAGE_FILE = path.join('coverage', 'coverage-final.json');
const REPO_ROOT = process.cwd().replace(/\\/g, '/');

const IGNORE_PATH =
  /(^|\/)(.*\.spec\.ts|test-setup\.ts|setup-zone\.ts|polyfills\.ts|environments\/)/;

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim();
}

function resolveBase() {
  try {
    git(`rev-parse --verify ${BASE}`);
    return BASE;
  } catch {
    const fallback = git('merge-base HEAD origin/main || git merge-base HEAD main || echo HEAD~1');
    return fallback.split('\n').pop();
  }
}

function isSourceFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (!normalized.startsWith('src/') || !normalized.endsWith('.ts')) {
    return false;
  }
  return !IGNORE_PATH.test(normalized);
}

function parseAddedLines(diff) {
  /** @type {Map<string, Set<number>>} */
  const added = new Map();
  let currentFile = null;
  let newLine = 0;

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      currentFile = raw.slice('+++ b/'.length).replace(/\\/g, '/');
      if (currentFile === '/dev/null' || !isSourceFile(currentFile)) {
        currentFile = null;
      } else if (!added.has(currentFile)) {
        added.set(currentFile, new Set());
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      added.get(currentFile).add(newLine);
      newLine += 1;
      continue;
    }

    if (raw.startsWith('-') && !raw.startsWith('---')) {
      continue;
    }

    if (raw.startsWith('\\')) {
      continue;
    }

    newLine += 1;
  }

  return added;
}

function findFileCoverage(coverage, gitPath) {
  const needle = gitPath.replace(/\\/g, '/');
  for (const [key, value] of Object.entries(coverage)) {
    const normalized = String(key).replace(/\\/g, '/');
    if (
      normalized === needle ||
      normalized.endsWith(`/${needle}`) ||
      normalized === `${REPO_ROOT}/${needle}`
    ) {
      return value;
    }
  }
  return null;
}

function lineHits(fileCoverage) {
  /** @type {Map<number, number>} */
  const hits = new Map();
  if (!fileCoverage?.statementMap || !fileCoverage?.s) {
    return hits;
  }

  for (const [id, loc] of Object.entries(fileCoverage.statementMap)) {
    const line = loc?.start?.line;
    if (typeof line !== 'number') {
      continue;
    }
    const count = Number(fileCoverage.s[id] || 0);
    hits.set(line, Math.max(hits.get(line) || 0, count));
  }
  return hits;
}

function isProbablyNonExecutable(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
    return true;
  }
  if (trimmed === '{' || trimmed === '}' || trimmed === ');' || trimmed === '};') {
    return true;
  }
  return false;
}

function fileLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function main() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error(`Missing ${COVERAGE_FILE}. Run: npm run test:coverage`);
    process.exit(1);
  }

  const base = resolveBase();
  const range = `${base}...HEAD`;
  let diff = '';
  try {
    // Three-dot: commits on this branch. Also include unstaged/uncommitted source so local checks match GitHub after push.
    const committed = git(`diff -U0 --no-color ${range}`);
    const working = git(`diff -U0 --no-color HEAD`);
    diff = [committed, working].filter(Boolean).join('\n');
  } catch (error) {
    console.error(`Could not diff against ${base}. Fetch the base branch first.`);
    console.error(error.stderr || error.message);
    process.exit(1);
  }

  const added = parseAddedLines(diff);
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));

  let executable = 0;
  let covered = 0;
  const rows = [];

  for (const [filePath, lines] of added) {
    if (lines.size === 0) {
      continue;
    }

    const contents = fileLines(filePath);
    const hits = lineHits(findFileCoverage(coverage, filePath));
    const uncovered = [];
    let fileExecutable = 0;
    let fileCovered = 0;

    for (const line of [...lines].sort((a, b) => a - b)) {
      const text = contents[line - 1] ?? '';
      const known = hits.has(line);
      if (!known && isProbablyNonExecutable(text)) {
        continue;
      }

      fileExecutable += 1;
      const count = hits.get(line) || 0;
      if (count > 0) {
        fileCovered += 1;
      } else {
        uncovered.push(line);
      }
    }

    executable += fileExecutable;
    covered += fileCovered;

    if (fileExecutable > 0) {
      const pct = (fileCovered / fileExecutable) * 100;
      rows.push({
        file: filePath,
        executable: fileExecutable,
        covered: fileCovered,
        pct,
        uncovered,
      });
    }
  }

  console.log(`Patch coverage vs ${range}`);
  console.log(`Threshold: ${THRESHOLD}% of new/changed executable lines\n`);

  if (rows.length === 0) {
    console.log('No executable source lines changed. Patch coverage check skipped.');
    process.exit(0);
  }

  const width = Math.max(...rows.map((row) => row.file.length), 12);
  console.log(
    `${'File'.padEnd(width)}  ${'Covered'.padStart(8)}  ${'Lines'.padStart(6)}  ${'Pct'.padStart(7)}`,
  );
  for (const row of rows) {
    console.log(
      `${row.file.padEnd(width)}  ${String(row.covered).padStart(8)}  ${String(row.executable).padStart(6)}  ${row.pct.toFixed(1).padStart(6)}%`,
    );
    if (row.uncovered.length) {
      console.log(`  uncovered lines: ${row.uncovered.join(', ')}`);
    }
  }

  const percent = (covered / executable) * 100;
  console.log(`\nPatch coverage: ${covered}/${executable} = ${percent.toFixed(1)}%`);

  if (percent + 1e-9 < THRESHOLD) {
    console.error(
      `\nFAIL: patch coverage ${percent.toFixed(1)}% is below ${THRESHOLD}%. Add tests for the new/changed code.`,
    );
    process.exit(1);
  }

  console.log(`\nPASS: patch coverage meets ${THRESHOLD}%.`);
}

main();
