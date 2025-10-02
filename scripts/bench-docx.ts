/*
Usage:
  npm run perf:docx -- --file=./path/to/sample.docx --runs=5 --concurrency=2

Measures parse time for DOCX -> HTML extraction using the app's DocxProcessor.
*/

import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DocxProcessor } from '../server/docx-processor';
import { performance } from 'node:perf_hooks';

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return {
    file: args.file,
    runs: Number(args.runs || '5'),
    concurrency: Number(args.concurrency || '2'),
  };
}

class Limiter {
  private current = 0;
  private queue: Array<() => void> = [];
  constructor(private readonly concurrency: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.current >= this.concurrency) await new Promise<void>(r => this.queue.push(r));
    this.current++;
    try { return await fn(); } finally {
      this.current--;
      const n = this.queue.shift(); if (n) n();
    }
  }
}

async function main() {
  const { file, runs, concurrency } = parseArgs();
  if (!file) {
    console.error('Missing --file=path/to/sample.docx');
    process.exit(1);
  }
  const abs = path.resolve(process.cwd(), file);
  const buf = await readFile(abs);
  const limiter = new Limiter(concurrency);

  const times: number[] = [];
  const startAll = Date.now();

  await Promise.all(Array.from({ length: runs }, (_, i) => limiter.run(async () => {
    const t0 = performance.now();
    const res = await DocxProcessor.parseDocx(Buffer.from(buf));
    const t1 = performance.now();
    times.push(t1 - t0);
    if (i === 0) console.log(`First run words=${res.metadata.wordCount}, pages=${res.metadata.pageCount}`);
  })));

  const total = Date.now() - startAll;
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = [...times].sort((a,b)=>a-b)[Math.floor(times.length * 0.95) - 1] || avg;
  console.log(`Runs=${runs}, Concurrency=${concurrency}`);
  console.log(`Total=${total.toFixed(0)}ms, Avg=${avg.toFixed(1)}ms, P95=${p95?.toFixed(1)}ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
