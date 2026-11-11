#!/usr/bin/env node
/**
 * cryptificate init | check | doctor | serve | experiment | verify | report
 */
import { EXIT_ERROR } from './policy.js';
import { main } from './cli-main.js';

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    process.stderr.write(`cryptificate: ${(e as Error).message}\n`);
    process.exitCode = EXIT_ERROR;
  },
);
