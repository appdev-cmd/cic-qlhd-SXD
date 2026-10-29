// Small Markdown parser for the in-app user guide (docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md).
// Supports the subset used there: ATX headings, paragraphs (with hard breaks), bullet / numbered /
// task lists (nested by indentation), pipe tables, fenced code blocks, blockquotes, horizontal rules,
// and inline code, bold, italic and links. Output is a plain AST: rendering is done by React,
// so every piece of text is escaped by construction (no HTML passthrough).

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'break' };

export type Align = 'left' | 'center' | 'right' | undefined;

export interface ListItem {
  /** Task-list state when the item starts with `[ ]` / `[x]`. */
  checked?: boolean;
  blocks: Block[];
}

export type Block =
  | { type: 'heading'; level: number; id: string; text: string; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'table'; header: Inline[][]; align: Align[]; rows: Inline[][][] }
  | { type: 'code'; lang: string; text: string }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'rule' };

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const ESCAPABLE = '\\`*_{}[]()#+-.!|>~';

function findClosing(src: string, token: string, from: number): number {
  let i = from;
  while (i < src.length) {
    const at = src.indexOf(token, i);
    if (at < 0) return -1;
    if (src[at - 1] !== '\\') return at;
    i = at + token.length;
  }
  return -1;
}

/** Parses inline Markdown into an AST. Unmatched markers stay literal text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      let ticks = 1;
      while (src[i + ticks] === '`') ticks++;
      const fence = '`'.repeat(ticks);
      const end = src.indexOf(fence, i + ticks);
      if (end > 0) {
        flush();
        out.push({ type: 'code', text: src.slice(i + ticks, end).trim() || src.slice(i + ticks, end) });
        i = end + ticks;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] === ch) {
      const token = ch + ch;
      const end = findClosing(src, token, i + 2);
      if (end > i + 2 && src[i + 2] !== ' ') {
        flush();
        out.push({ type: 'strong', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === '*' || (ch === '_' && !/[\p{L}\p{N}]/u.test(src[i - 1] || ''))) {
      let end = i + 1;
      while (true) {
        end = findClosing(src, ch, end);
        // Skip "**" inside an emphasis run and, for "_", closers inside words (file_names_like_this).
        if (end > 0 && src[end + 1] === ch) end += 2;
        else if (end > 0 && ch === '_' && /[\p{L}\p{N}]/u.test(src[end + 1] || '')) end += 1;
        else break;
      }
      if (end > i + 1 && src[i + 1] !== ' ' && src[end - 1] !== ' ') {
        flush();
        out.push({ type: 'em', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const close = findClosing(src, '](', i + 1);
      const end = close > 0 ? src.indexOf(')', close + 2) : -1;
      if (close > 0 && end > 0 && !src.slice(i + 1, close).includes('\n')) {
        flush();
        out.push({
          type: 'link',
          href: src.slice(close + 2, end).trim(),
          children: parseInline(src.slice(i + 1, close)),
        });
        i = end + 1;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

/** Plain text of inline nodes (search index, slugs, sort values). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) =>
      n.type === 'text' || n.type === 'code'
        ? n.text
        : n.type === 'break'
          ? ' '
          : 'children' in n
            ? inlineText(n.children)
            : '',
    )
    .join('');
}

/** Plain text of blocks, used for searching sections. */
export function blocksText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return b.text;
        case 'paragraph':
          return inlineText(b.inlines);
        case 'list':
          return b.items.map((item) => blocksText(item.blocks)).join(' ');
        case 'table':
          return [b.header, ...b.rows].map((row) => row.map(inlineText).join(' ')).join(' ');
        case 'code':
          return b.text;
        case 'quote':
          return blocksText(b.blocks);
        default:
          return '';
      }
    })
    .join(' ');
}

/** GitHub-style heading anchor: lowercase, punctuation removed, spaces → "-"; keeps Vietnamese letters. */
export function slugify(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.length - line.trimStart().length;
const isBlank = (line: string) => !line.trim();

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cell += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function isTableStart(lines: string[], i: number): boolean {
  return (
    lines[i].includes('|') && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]) && lines[i + 1].includes('-')
  );
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    /^\s{0,3}>/.test(line) ||
    (LIST_ITEM.test(line) && indentOf(line) < 4 && !!LIST_ITEM.exec(line)?.[4]) ||
    isTableStart(lines, i)
  );
}

interface ParseContext {
  slugs: Map<string, number>;
}

function uniqueSlug(ctx: ParseContext, text: string): string {
  const base = slugify(text) || 'muc';
  const seen = ctx.slugs.get(base) || 0;
  ctx.slugs.set(base, seen + 1);
  return seen ? `${base}-${seen}` : base;
}

function paragraphInlines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((raw, index) => {
    const hard = / {2,}$/.test(raw) || /\\$/.test(raw);
    const line = raw.trim().replace(/\\$/, '');
    out.push(...parseInline(line));
    if (index < lines.length - 1) out.push(hard ? { type: 'break' } : { type: 'text', text: ' ' });
  });
  return out;
}

function parseList(lines: string[], start: number, ctx: ParseContext): { block: Block; next: number } {
  const first = LIST_ITEM.exec(lines[start])!;
  const baseIndent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items: ListItem[] = [];
  let i = start;
  while (i < lines.length) {
    const m = LIST_ITEM.exec(lines[i]);
    if (!m || m[1].length !== baseIndent || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = baseIndent + m[2].length + Math.max(1, Math.min(m[3].length, 4));
    const body: string[] = [m[4]];
    i++;
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) {
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j < lines.length && indentOf(lines[j]) >= contentIndent) {
          for (; i < j; i++) body.push('');
          continue;
        }
        break;
      }
      const indent = indentOf(line);
      if (indent >= contentIndent || (indent > baseIndent && LIST_ITEM.test(line))) {
        body.push(line.slice(Math.min(indent, contentIndent)));
        i++;
        continue;
      }
      // Lazy continuation of the item's paragraph.
      if (indent > baseIndent || (!startsBlock(lines, i) && !isBlank(body[body.length - 1]))) {
        body.push(line.trim());
        i++;
        continue;
      }
      break;
    }
    let checked: boolean | undefined;
    const task = /^\[([ xX])\]\s+/.exec(body[0]);
    if (task) {
      checked = task[1] !== ' ';
      body[0] = body[0].slice(task[0].length);
    }
    items.push({ checked, blocks: parseLines(body, ctx) });
    // A blank line between items of the same list keeps the list going.
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    const again = j < lines.length ? LIST_ITEM.exec(lines[j]) : null;
    if (again && again[1].length === baseIndent && /\d/.test(again[2]) === ordered) i = j;
    else break;
  }
  return { block: { type: 'list', ordered, start: ordered ? parseInt(first[2], 10) || 1 : 1, items }, next: i };
}

function parseLines(lines: string[], ctx: ParseContext): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const inlines = parseInline(heading[2]);
      const text = inlineText(inlines);
      blocks.push({ type: 'heading', level: heading[1].length, id: uniqueSlug(ctx, text), text, inlines });
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const header = splitRow(line).map(parseInline);
      const align: Align[] = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(':') && cell.endsWith(':')
          ? 'center'
          : cell.endsWith(':')
            ? 'right'
            : cell.startsWith(':')
              ? 'left'
              : undefined,
      );
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        const cells = splitRow(lines[i]).map(parseInline);
        while (cells.length < header.length) cells.push([]);
        rows.push(cells.slice(0, header.length));
        i++;
      }
      blocks.push({ type: 'table', header, align: align.slice(0, header.length), rows });
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      blocks.push({ type: 'quote', blocks: parseLines(body, ctx) });
      continue;
    }
    if (LIST_ITEM.test(line) && LIST_ITEM.exec(line)![4] !== undefined) {
      const { block, next } = parseList(lines, i, ctx);
      blocks.push(block);
      i = next;
      continue;
    }
    const body: string[] = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) body.push(lines[i++]);
    blocks.push({ type: 'paragraph', inlines: paragraphInlines(body) });
  }
  return blocks;
}

/** Parses a Markdown document. Heading ids are unique within the document. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  return parseLines(lines, { slugs: new Map() });
}

// ---------------------------------------------------------------------------
// Sections (for the help page: table of contents and search)
// ---------------------------------------------------------------------------

export interface DocSubsection {
  id: string;
  title: string;
  heading: Extract<Block, { type: 'heading' }>;
  blocks: Block[];
  text: string;
}

export interface DocSection {
  id: string;
  title: string;
  /** Null for the preamble before the first level-2 heading. */
  heading: Extract<Block, { type: 'heading' }> | null;
  /** Blocks before the first level-3 heading. */
  intro: Block[];
  subsections: DocSubsection[];
  /** Plain text of the whole section (title, intro, subsections). */
  text: string;
  introText: string;
}

/** Groups blocks by level-2 headings, with level-3 headings as subsections. */
export function splitSections(blocks: Block[]): DocSection[] {
  const sections: DocSection[] = [];
  const open = (heading: DocSection['heading']): DocSection => {
    const section: DocSection = {
      id: heading?.id || 'gioi-thieu',
      title: heading?.text || 'Giới thiệu',
      heading,
      intro: [],
      subsections: [],
      text: '',
      introText: '',
    };
    sections.push(section);
    return section;
  };
  let current: DocSection | null = null;
  let sub: DocSubsection | null = null;
  for (const block of blocks) {
    if (block.type === 'heading' && block.level === 2) {
      current = open(block);
      sub = null;
      continue;
    }
    if (!current) current = open(null);
    if (block.type === 'heading' && block.level === 3) {
      sub = { id: block.id, title: block.text, heading: block, blocks: [], text: '' };
      current.subsections.push(sub);
      continue;
    }
    if (sub) sub.blocks.push(block);
    else current.intro.push(block);
  }
  for (const section of sections) {
    for (const s of section.subsections) s.text = s.title + ' ' + blocksText(s.blocks);
    section.introText = blocksText(section.intro);
    section.text = [section.title, section.introText, ...section.subsections.map((s) => s.text)].join(' ');
  }
  return sections;
}
