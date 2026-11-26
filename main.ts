// Ridge Runner — entry program (Node 22, standard library only).
// Hands the game in: copies this repository's game/ and screenshots/ into the
// output directory and writes /output/dossier.json with the vendored make.fun
// library's buildDossier, under the same caps the scorer enforces.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (the competition's gate.json): only text_max_bytes
// shapes the bytes; the others refuse an entry the scorer would refuse (more
// than 4 screenshots or one over 256 KiB; more than 993 files in game/ or
// 48 MiB of game files, or a path under game/ over 1000 bytes). Passing them
// here makes this program fail exactly where the scorer would, instead of
// handing in an entry the gate refuses.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
