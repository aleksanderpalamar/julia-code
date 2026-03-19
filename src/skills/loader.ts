import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Skill } from './types.js';

const DEFAULTS_DIR = new URL('defaults/', import.meta.url).pathname;
const USER_SKILLS_DIR = join(process.cwd(), 'data', 'skills');

export function loadSkills(): Skill[] {
  const skills: Skill[] = [];

  // Load built-in skills
  skills.push(...loadFromDir(DEFAULTS_DIR));

  // Load user skills
  if (existsSync(USER_SKILLS_DIR)) {
    skills.push(...loadFromDir(USER_SKILLS_DIR));
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
