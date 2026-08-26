/* Shared by scripts/migrate.ts and test/helpers.ts — neither runs under wrangler, so neither gets
   .dev.vars loaded automatically the way `wrangler dev` does; both read it by hand instead. */
import { readFileSync } from 'node:fs';

export function loadDevVars(devVarsPath: string): Record<string, string> {
  const text = readFileSync(devVarsPath, 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    // .dev.vars follows dotenv conventions — some values here are quoted; wrangler's own loader
    // strips that, this naive line-parser has to do it by hand.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
