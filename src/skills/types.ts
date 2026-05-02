export interface SkillFrontmatter {
  name?: string;
  description?: string;
  when_to_use?: string;
  argument_hint?: string;
  user_invocable?: boolean;
  always_load?: boolean;
}

export interface Skill {
  name: string;
  content: string;
  frontmatter?: SkillFrontmatter;
}
