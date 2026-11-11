/**
 * Source positions of JSON values, keyed by JSON pointer (RFC 6901).
 *
 * JSON.parse keeps no positions, so this is a small separate scanner. It is
 * only used to place report annotations (SARIF regions) in the user's file;
 * the request itself is always read with JSON.parse.
 */

export interface Position {
  /** 1-based line. */
  line: number;
  /** 1-based column in UTF-16 code units (the SARIF default). */
  column: number;
}

/** Escape one reference token of a JSON pointer. */
export function pointerToken(token: string | number): string {
  return String(token).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Start position of every value in `text`. Returns null when the text is not
 * valid JSON. For an object member the position is that of its key, which is
 * where an editor would put the cursor for "this field".
 */
export function locateJson(text: string): Map<string, Position> | null {
  const out = new Map<string, Position>();
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const pos = (at: number): Position => ({ line, column: at - lineStart + 1 });

  const ws = (): void => {
    while (i < text.length) {
      const c = text[i];
      if (c === '\n') {
        line++;
        i++;
        lineStart = i;
      } else if (c === ' ' || c === '\t' || c === '\r') i++;
      else break;
    }
  };
  const fail = (): never => {
    throw new SyntaxError('invalid JSON');
  };
  const str = (): string => {
    if (text[i] !== '"') fail();
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text[i] === '\n') fail();
      i++;
    }
    if (i >= text.length) fail();
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (ptr: string, at: Position | null): void => {
    ws();
    if (i >= text.length) fail();
    if (!out.has(ptr)) out.set(ptr, at ?? pos(i));
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        const keyAt = pos(i);
        const key = str();
        ws();
        if (text[i] !== ':') fail();
        i++;
        value(`${ptr}/${pointerToken(key)}`, keyAt);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (let k = 0; ; k++) {
        value(`${ptr}/${k}`, null);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '"') {
      str();
      return;
    }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i, i + 400));
    if (!m) fail();
    i += m![0].length;
  };

  try {
    if (text.charCodeAt(0) === 0xfeff) {
      i = 1;
      lineStart = 1;
    }
    value('', null);
    ws();
    if (i !== text.length) fail();
  } catch {
    return null;
  }
  return out;
}

/**
 * Position of `pointer`, or of its nearest ancestor that exists in the
 * document (the whole document at worst). Null for text that is not JSON.
 */
export function positionOf(positions: Map<string, Position> | null, pointer: string): Position | null {
  if (!positions) return null;
  let p = pointer;
  for (;;) {
    const hit = positions.get(p);
    if (hit) return hit;
    if (p === '') return null;
    p = p.slice(0, p.lastIndexOf('/'));
  }
}
