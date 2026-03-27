export interface SlashCommand {
  name: string;
  description: string;
  /** Auto-submit this command as soon as the user finishes typing it (no Enter needed). */
  autoTrigger?: boolean;
}
