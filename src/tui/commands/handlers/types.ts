import type React from "react";
import type { AgentMode, Temperament } from "../../types.js";

export interface SlashCommandContext {
  exit: () => void;
  addSystemEntry: (content: string) => void;
  setMode: React.Dispatch<React.SetStateAction<AgentMode>>;
  setTemperament: React.Dispatch<React.SetStateAction<Temperament>>;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  setShowModelPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setShowToolModelPicker: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingImages: React.Dispatch<React.SetStateAction<string[]>>;
  setPendingImageNames: React.Dispatch<React.SetStateAction<string[]>>;
  setTrusted: React.Dispatch<React.SetStateAction<boolean>>;
  projectDir: string;
  pendingImageNames: string[];
  pendingImages: string[];
  session: { id: string };
  model: string;
  mode: AgentMode;
  temperament: Temperament;
  sendMessage: (
    sessionId: string,
    message: string,
    model?: string,
    mode?: AgentMode,
    images?: string[],
    temperament?: Temperament,
    skillContent?: string,
  ) => void;
}

export interface SlashCommand {
  match: (text: string) => boolean;
  handle: (text: string, ctx: SlashCommandContext) => boolean | Promise<boolean>;
}
