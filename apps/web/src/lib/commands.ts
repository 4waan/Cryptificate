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

/** Letters in order inside one label word that starts with the same letter ("wrkspc" in "workspace"). */
function fuzzyWord(q: string, labelWords: string[]): boolean {
  return q.length > 1 && labelWords.some((w) => w[0] === q[0] && subsequence(q, w));
}

/** Scores and whether any query word matched only by letters in order. */
function match(c: Command, query: string[]): { score: number; fuzzy: boolean } {
  if (!query.length) return { score: 1, fuzzy: false };
  const label = c.label.toLowerCase();
  const labelWords = words(c.label);
  const extra = `${c.group} ${c.keywords ?? ''}`.toLowerCase();
  let score = 0;
  let fuzzy = false;
  for (const q of query) {
    if (labelWords.some((w) => w.startsWith(q))) score += 8;
    else if (label.includes(q)) score += 5;
    else if (extra.includes(q)) score += 3;
    else if (fuzzyWord(q, labelWords)) {
      score += 1;
      fuzzy = true;
    } else return { score: 0, fuzzy: false };
  }
  return { score, fuzzy };
}

/**
 * Scores a command against the query words: 0 means no match. Every query
 * word must match. A word that starts a label word scores highest, then a
 * substring of the label, then the group or keywords, then letters in order
 * within one label word.
 */
export function scoreCommand(c: Command, query: string[]): number {
  return match(c, query).score;
}

/**
 * The commands matching the query, best first. Letters-in-order matches
 * are a last resort: they are listed only when nothing matches better.
 */
export function filterCommands(query: string, commands: Command[]): Command[] {
  const q = words(query);
  const scored = commands.map((c, i) => ({ c, i, ...match(c, q) })).filter((x) => x.score > 0);
  const exact = scored.filter((x) => !x.fuzzy);
  return (exact.length ? exact : scored).sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.c);
}
