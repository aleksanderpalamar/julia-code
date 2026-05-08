export interface Worktree {
  id: string;
  path: string;
  branch: string;
  baseBranch: string;
  createdAt: Date;
}

export interface MergeResult {
  merged: boolean;
  reason?: 'no-changes' | 'conflict';
  commitSha?: string;
  branch?: string;
}
