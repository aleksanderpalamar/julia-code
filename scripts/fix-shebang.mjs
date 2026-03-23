import { readFileSync, writeFileSync } from 'fs';

const file = 'dist/juju.js';
let content = readFileSync(file, 'utf8');
content = content.replace('#!/usr/bin/env tsx', '#!/usr/bin/env node');
writeFileSync(file, content);
