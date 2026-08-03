export interface SkillFrontmatter {
  name?: string;
  description?: string;
  when_to_use?: string;
  argument_hint?: string;
  user_invocable?: boolean;
  always_load?: boolean;
  /**
   * Dialogue-only skills (Q&A, requirement elicitation) set this `false` so the
   * intent-without-action nudge/warning path stays silent during their turns.
   * Default `true` — most skills are expected to drive the model toward tools.
   */
  expects_tools?: boolean;
}

export interface Skill {
  name: string;
  content: string;
  frontmatter?: SkillFrontmatter;
}
