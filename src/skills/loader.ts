import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Skill } from './types.js';
import { scanForInjection } from '../security/sanitize.js';
import { logMcp } from '../mcp/logger.js';

const DEFAULTS_DIR = new URL('defaults/', import.meta.url).pathname;
const USER_SKILLS_DIR = join(process.cwd(), 'data', 'skills');

const MAX_SKILL_SIZE = 50 * 1024;

export function loadSkills(): Skill[] {
  return loadFromDir(DEFAULTS_DIR);
}

export function loadUserSkills(): Skill[] {
  if (!existsSync(USER_SKILLS_DIR)) return [];

  const skills: Skill[] = [];
  if (!existsSync(USER_SKILLS_DIR)) return skills;

  for (const file of readdirSync(USER_SKILLS_DIR)) {
    if (!file.endsWith('.md')) continue;

    const filePath = join(USER_SKILLS_DIR, file);

    const stat = statSync(filePath);
    if (stat.size > MAX_SKILL_SIZE) {
      logMcp(`[security] Skill "${file}" excede ${MAX_SKILL_SIZE} bytes — ignorado`);
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');

    const scan = scanForInjection(content);
    if (scan.isSuspicious) {
      logMcp(
        `[security] Skill "${file}" contém padrões suspeitos (${scan.detections.join(', ')}) — ignorado`
      );
      continue;
    }

    skills.push({ name: basename(file, '.md'), content });
  }

  return skills;
}

export function loadTemperamentSkill(temperament: string): Skill | null {
  const TEMPERAMENTS_DIR = new URL('temperaments/', import.meta.url).pathname;
  const filePath = join(TEMPERAMENTS_DIR, `${temperament}.md`);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf-8');
  if (!content.trim()) return null;
  return { name: `temperament-${temperament}`, content };
}

function loadFromDir(dir: string): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(dir)) return skills;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const content = readFileSync(join(dir, file), 'utf-8');
    skills.push({ name: basename(file, '.md'), content });
  }

  return skills;
}
