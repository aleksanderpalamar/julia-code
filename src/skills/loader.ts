import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { Skill, SkillFrontmatter } from './types.js';
import { scanForInjection } from '../security/sanitize.js';
import { logMcp } from '../mcp/logger.js';

const DEFAULTS_DIR = new URL('defaults/', import.meta.url).pathname;
const USER_SKILLS_DIR = join(process.cwd(), 'data', 'skills');

const MAX_SKILL_SIZE = 50 * 1024;

function parseFrontmatter(raw: string): { frontmatter: SkillFrontmatter; body: string } {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) {
    return { frontmatter: {}, body: raw };
  }
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return { frontmatter: {}, body: raw };

  const yamlBlock = raw.slice(4, end);
  const body = raw.slice(end + 5).trimStart();
  const frontmatter: SkillFrontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name')           frontmatter.name = value;
    if (key === 'description')    frontmatter.description = value;
    if (key === 'when_to_use')    frontmatter.when_to_use = value;
    if (key === 'argument_hint')  frontmatter.argument_hint = value;
    if (key === 'user_invocable') frontmatter.user_invocable = value === 'true';
    if (key === 'always_load')    frontmatter.always_load = value !== 'false';
  }
  return { frontmatter, body };
}

export function applyArguments(content: string, args: string): string {
  return content.replace(/\$ARGUMENTS/g, args);
}

export function loadSkills(): Skill[] {
  return loadFromDir(DEFAULTS_DIR);
}

export function loadUserSkills(): Skill[] {
  if (!existsSync(USER_SKILLS_DIR)) return [];

  const skills: Skill[] = [];

  for (const file of readdirSync(USER_SKILLS_DIR)) {
    if (!file.endsWith('.md')) continue;

    const filePath = join(USER_SKILLS_DIR, file);

    const stat = statSync(filePath);
    if (stat.size > MAX_SKILL_SIZE) {
      logMcp(`[security] Skill "${file}" excede ${MAX_SKILL_SIZE} bytes — ignorado`);
      continue;
    }

    const raw = readFileSync(filePath, 'utf-8');

    const scan = scanForInjection(raw);
    if (scan.isSuspicious) {
      logMcp(
        `[security] Skill "${file}" contém padrões suspeitos (${scan.detections.join(', ')}) — ignorado`
      );
      continue;
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    skills.push({ name: frontmatter.name ?? basename(file, '.md'), content: body, frontmatter });
  }

  return skills;
}

export function loadTemperamentSkill(temperament: string): Skill | null {
  const TEMPERAMENTS_DIR = new URL('temperaments/', import.meta.url).pathname;
  const filePath = join(TEMPERAMENTS_DIR, `${temperament}.md`);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(raw);
  if (!body.trim()) return null;
  return { name: `temperament-${temperament}`, content: body, frontmatter };
}

function loadFromDir(dir: string): Skill[] {
  const skills: Skill[] = [];
  if (!existsSync(dir)) return skills;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(join(dir, file), 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);
    skills.push({ name: frontmatter.name ?? basename(file, '.md'), content: body, frontmatter });
  }

  return skills;
}
