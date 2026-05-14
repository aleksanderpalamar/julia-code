import { z } from 'zod';

const HookCommandSchema = z.object({
  type: z.literal('command').default('command'),
  command: z.string(),
  timeout: z.number().optional(),
});

const HookEntrySchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(HookCommandSchema),
});

export const HooksSchema = z.object({
  PreToolUse: z.array(HookEntrySchema).optional(),
  PostToolUse: z.array(HookEntrySchema).optional(),
  UserPromptSubmit: z.array(HookEntrySchema).optional(),
  Stop: z.array(HookEntrySchema).optional(),
  SubagentStop: z.array(HookEntrySchema).optional(),
  SessionStart: z.array(HookEntrySchema).optional(),
  Notification: z.array(HookEntrySchema).optional(),
  PreCompact: z.array(HookEntrySchema).optional(),
}).optional();

export type HooksConfig = z.infer<typeof HooksSchema>;
export type HookCommand = z.infer<typeof HookCommandSchema>;
export type HookEntry = z.infer<typeof HookEntrySchema>;
