export interface SlashCommand {
  name: string;
  description: string;
  autoTrigger?: boolean;
  argumentHint?: string;
  isSkill?: boolean;
  skillName?: string;
}
