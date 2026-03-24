import { readFileSync, writeFileSync, chmodSync, cpSync } from 'fs';

const file = 'dist/juju.js';
let content = readFileSync(file, 'utf8');
content = content.replace('#!/usr/bin/env tsx', '#!/usr/bin/env node');
writeFileSync(file, content);
chmodSync(file, 0o755);

// Copy skill markdown files to dist (tsc only compiles .ts/.tsx)
cpSync('src/skills/defaults', 'dist/src/skills/defaults', { recursive: true });
cpSync('src/skills/temperaments', 'dist/src/skills/temperaments', { recursive: true });
