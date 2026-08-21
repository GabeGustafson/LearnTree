import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const pkgRoot = join(import.meta.dirname, '..');
const bundle = join(pkgRoot, 'dist', 'learntree-validate.mjs');
const validDir = join(import.meta.dirname, 'fixtures', 'valid-forest');
const brokenDir = join(import.meta.dirname, 'fixtures', 'broken-forest');

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [bundle, ...args], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

beforeAll(() => {
  // Exercise the real committed-artifact path: bundle first, test the bundle.
  execSync('node build.mjs', { cwd: pkgRoot });
});

describe('learntree validate', () => {
  test('valid forest exits 0; orphan progress is info-only', () => {
    const r = runCli(['validate', validDir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('✓ valid');
    expect(r.stdout).toContain('I-PROGRESS-ORPHAN');
    expect(r.stdout).toContain('gone-module');
  });

  test('--json emits machine-readable diagnostics', () => {
    const r = runCli(['validate', validDir, '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout) as {
      ok: boolean;
      summary: { errors: number };
      diagnostics: Array<{ code: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.summary.errors).toBe(0);
    expect(parsed.diagnostics.some((d) => d.code === 'I-PROGRESS-ORPHAN')).toBe(true);
  });

  test('broken forest exits 1 with positioned, coded errors', () => {
    const r = runCli(['validate', brokenDir]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('✗ invalid');
    expect(r.stdout).toContain('E-SCHEMA-UNKNOWN-KEY');
    expect(r.stdout).toContain("did you mean 'title'?");
    expect(r.stdout).toMatch(/trees\/bad\.yaml:\d+:\d+/);
  });
});

describe('learntree outline', () => {
  test('renders the resolved forest deterministically', () => {
    const r = runCli(['outline', validDir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatchSnapshot();
  });
});

describe('learntree emit-schemas', () => {
  test('writes the three JSON Schema artifacts', () => {
    const out = mkdtempSync(join(tmpdir(), 'learntree-schemas-'));
    const r = runCli(['emit-schemas', out]);
    expect(r.status).toBe(0);
    for (const name of ['forest.schema.json', 'tree.schema.json', 'progress.schema.json']) {
      const file = join(out, name);
      expect(existsSync(file)).toBe(true);
      const schema = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      expect(schema['$schema']).toContain('2020-12');
    }
  });
});
