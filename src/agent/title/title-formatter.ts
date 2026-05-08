const MAX_TITLE_LENGTH = 80;

export function formatTitleFromLLM(rawTitle: string): string {
  return rawTitle
    .trim()
    .replace(/^["']|["']$/g, '')
    .slice(0, MAX_TITLE_LENGTH);
}

export function isValidTitle(title: string): boolean {
  return title.trim().length > 0;
}
