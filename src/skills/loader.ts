import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Skill } from './types.js';
import { scanForInjection } from '../security/sanitize.js';

const DEFAULTS_DIR = new URL('defaults/', import.meta.url).pathname;
const USER_SKILLS_DIR = join(process.cwd(), 'data', 'skills');

/** Maximum allowed skill file size (50KB). */
const MAX_SKILL_SIZE = 50 * 1024;

/**
 * Load only built-in (system) skills. These are fully trusted.
 */
export function loadSkills(): Skill[] {
  return loadFromDir(DEFAULTS_DIR);
}

/**
 * Load user-defined skills separately, with validation.
 * These are loaded into a lower-trust section of the prompt.
 */
export function loadUserSkills(): Skill[] {
  if (!existsSync(USER_SKILLS_DIR)) return [];

  const skills: Skill[] = [];
  if (!existsSync(USER_SKILLS_DIR)) return skills;

  for (const file of readdirSync(USER_SKILLS_DIR)) {
    if (!file.endsWith('.md')) continue;

    const filePath = join(USER_SKILLS_DIR, file);

    // Check file size
    const stat = statSync(filePath);
    if (stat.size > MAX_SKILL_SIZE) {
      process.stderr.write(`[security] Skill "${file}" excede ${MAX_SKILL_SIZE} bytes — ignorado\n`);
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');

    // Scan for injection patterns
    const scan = scanForInjection(content);
    if (scan.isSuspicious) {
      process.stderr.write(
        `[security] Skill "${file}" contém padrões suspeitos (${scan.detections.join(', ')}) — ignorado\n`
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
