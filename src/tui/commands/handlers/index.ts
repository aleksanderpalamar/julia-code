import type { SlashCommand } from "./types.js";
import { quit } from "./quit.js";
import { clear } from "./clear.js";
import { stats } from "./stats.js";
import { trust } from "./trust.js";
import { mcp } from "./mcp.js";
import { model } from "./model.js";
import { toolModel } from "./toolModel.js";
import { toolPickModel } from "./toolPickModel.js";
import { temperament } from "./temperament.js";
import { mode } from "./mode.js";
import { image } from "./image.js";
import { skill } from "./skill.js";
import { indexCmd } from "./indexCmd.js";

export const slashCommands: SlashCommand[] = [
  quit,
  clear,
  stats,
  trust,
  mcp,
  toolModel,
  toolPickModel,
  model,
  temperament,
  mode,
  image,
  indexCmd,
  skill,
];

export type { SlashCommand, SlashCommandContext } from "./types.js";
