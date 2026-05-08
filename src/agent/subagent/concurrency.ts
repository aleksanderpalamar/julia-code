import { getConfig } from '../../config/index.js';

export class ConcurrencyController {
  private running = 0;
  private runningByModel = new Map<string, number>();

  private getModelLimit(model: string): number {
    const limits = getConfig().acpModelLimits ?? {};
    return limits[model] ?? Infinity;
  }

  canRun(model: string): boolean {
    if (this.running >= getConfig().acpMaxConcurrent) return false;
    const used = this.runningByModel.get(model) ?? 0;
    return used < this.getModelLimit(model);
  }

  isAtGlobalLimit(): boolean {
    return this.running >= getConfig().acpMaxConcurrent;
  }

  acquire(model: string): void {
    this.running++;
    this.runningByModel.set(model, (this.runningByModel.get(model) ?? 0) + 1);
  }

  release(model: string): void {
    this.running--;
    const curr = this.runningByModel.get(model) ?? 0;
    if (curr <= 1) this.runningByModel.delete(model);
    else this.runningByModel.set(model, curr - 1);
  }
}
