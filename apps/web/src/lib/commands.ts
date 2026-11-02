/**
 * The command palette's model: a flat list of commands, filtered by a
 * forgiving match over the label, group and keywords.
 */

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Extra words the filter matches, not shown. */
  keywords?: string;
  /** Shortcut shown beside the label, e.g. "Ctrl+Enter". */
  shortcut?: string;
  /** A short second line, e.g. what a preset is. */
  detail?: string;
  /** Why the command cannot run now; shown instead of running it. */
  disabled?: string;
  run(): void;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9⁰-⁹²³¹]+/i).filter(Boolean);
}

/** True when the letters of `needle` appear in order in `hay`. */
function subsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i]) i++;
  return i === needle.length;
}

/**
 * Scores a command against the query words: 0 means no match. Every query
 * word must match. A word that starts a label word scores highest, then a
 * substring of the label, then the group or keywords, then letters in order.
 */
export function scoreCommand(c: Command, query: string[]): number {
  if (!query.length) return 1;
  const label = c.label.toLowerCase();
  const labelWords = words(c.label);
  const extra = `${c.group} ${c.keywords ?? ''}`.toLowerCase();
  let score = 0;
  for (const q of query) {
    if (labelWords.some((w) => w.startsWith(q))) score += 8;
    else if (label.includes(q)) score += 5;
    else if (extra.includes(q)) score += 3;
    else if (q.length > 1 && subsequence(q, label)) score += 1;
    else return 0;
  }
  return score;
}

export function filterCommands(query: string, commands: Command[]): Command[] {
  const q = words(query);
  return commands
    .map((c, i) => ({ c, i, s: scoreCommand(c, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}
