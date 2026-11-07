/**
 * Line-by-line questions on a terminal (or on any stream, for tests).
 * Lines that arrive before a question is asked are kept, so answers can be
 * piped in ahead of the prompts.
 */
import { createInterface } from 'node:readline';

export interface Asker {
  /** The next line of input, or null at end of input. */
  ask(question: string): Promise<string | null>;
  close(): void;
}

export function makeAsker(input: NodeJS.ReadableStream, output: { write(s: string): unknown }): Asker {
  const rl = createInterface({ input, terminal: false, crlfDelay: Infinity });
  const lines: string[] = [];
  const waiting: Array<(line: string | null) => void> = [];
  let closed = false;
  rl.on('line', (line) => {
    const w = waiting.shift();
    if (w) w(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    closed = true;
    for (const w of waiting.splice(0)) w(null);
  });
  return {
    ask(question: string): Promise<string | null> {
      output.write(question);
      const line = lines.shift();
      if (line !== undefined) return Promise.resolve(line);
      if (closed) return Promise.resolve(null);
      return new Promise((res) => waiting.push(res));
    },
    close(): void {
      rl.close();
    },
  };
}

/**
 * Ask until the answer is one of `choices` (or empty, which gives `fallback`).
 * Returns null at end of input.
 */
export async function choose(asker: Asker, question: string, choices: readonly string[], fallback: string, out: { write(s: string): unknown }): Promise<string | null> {
  for (let tries = 0; tries < 5; tries++) {
    const line = await asker.ask(`${question} (${choices.join(', ')}) [${fallback}]: `);
    if (line === null) return null;
    const a = line.trim();
    if (a === '') return fallback;
    if (choices.includes(a)) return a;
    out.write(`  please answer one of ${choices.join(', ')}\n`);
  }
  return null;
}

/** Yes or no; empty gives `fallback`. Returns null at end of input. */
export async function confirm(asker: Asker, question: string, fallback: boolean, out: { write(s: string): unknown }): Promise<boolean | null> {
  for (let tries = 0; tries < 5; tries++) {
    const line = await asker.ask(`${question} [${fallback ? 'Y/n' : 'y/N'}]: `);
    if (line === null) return null;
    const a = line.trim().toLowerCase();
    if (a === '') return fallback;
    if (a === 'y' || a === 'yes') return true;
    if (a === 'n' || a === 'no') return false;
    out.write('  please answer y or n\n');
  }
  return null;
}
