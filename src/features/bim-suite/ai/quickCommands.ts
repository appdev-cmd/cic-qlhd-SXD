// Rule-based Vietnamese viewer commands that run WITHOUT a language model: the text is parsed into the same tool
// calls a model would produce and executed by executeBimViewerTool. Strict grammar: anything not fully understood
// returns calls = null with a helpful message (never a guess). Categories resolve through the BIM dictionary
// (lib/vietnameseBimMap) and IFC labels (lib/ifcLabels); floors are checked against the loaded storeys.
import { getIfcLabel, ifcLabels } from '../lib/ifcLabels';
import { matchesStorey } from '../lib/sectionLocation';
import { matchBimCategory, normalizeVi, VIETNAMESE_BIM_CATEGORIES } from '../lib/vietnameseBimMap';
import { describeToolCall, type BimToolCall } from './plan';

export interface QuickCommandContext {
  /** IFC classes present in the loaded models (viewer getCategories), upper case. Omit to skip the check. */
  categories?: string[];
  /** Storey names of the loaded models (viewer getStoreys). Omit to skip the check. */
  storeys?: string[];
}

export interface QuickCommandResult {
  /** Tool calls to run in order; null when the command was not understood. */
  calls: BimToolCall[] | null;
  /** What will be done, or why the command was not understood and what to type instead. */
  message: string;
}

export const QUICK_COMMAND_EXAMPLES = [
  'chỉ hiện cột',
  'cô lập dầm tầng 3',
  'ẩn tường',
  'tô màu cột màu đỏ',
  'tô màu cột đỏ, dầm xanh',
  'x-ray ống gió',
  'chỉ hiện kết cấu',
  'nhìn từ trên',
  'cắt tầng 2',
  'hộp cắt tầng 3',
  'cắt ở giữa',
  'tắt mặt cắt',
  'hiện tất cả',
  'hoàn tác',
];

export const COLOR_WORDS: [string, string][] = [
  ['xanh la cay', '#16a34a'],
  ['xanh la', '#16a34a'],
  ['xanh luc', '#16a34a'],
  ['xanh duong', '#2563eb'],
  ['xanh lam', '#2563eb'],
  ['xanh ngoc', '#0891b2'],
  ['xanh', '#2563eb'],
  ['do', '#dc2626'],
  ['vang', '#eab308'],
  ['cam', '#ea580c'],
  ['tim', '#7c3aed'],
  ['hong', '#db2777'],
];
const PALETTE = ['#dc2626', '#2563eb', '#eab308', '#16a34a', '#ea580c', '#7c3aed', '#db2777', '#0891b2'];

const help = (lead: string) =>
  `${lead} Thử: ${QUICK_COMMAND_EXAMPLES.slice(0, 8)
    .map((example) => `“${example}”`)
    .join(', ')}.`;
const notUnderstood = (message: string): QuickCommandResult => ({ calls: null, message });
const understood = (calls: BimToolCall[]): QuickCommandResult => ({
  calls,
  message: calls.map((call) => describeToolCall(call.name, call.args)).join(' → '),
});

const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
const wordRe = (phrase: string) => new RegExp(`(^|\\s)${phrase.replace(/\s+/g, '\\s+')}(?=\\s|$)`);
const hasWord = (text: string, phrase: string) => wordRe(phrase).test(text);
const removeWord = (text: string, phrase: string) => squash(text.replace(wordRe(phrase), ' '));

/** Lower-case, accent-free text without polite fillers and punctuation (commas and '#' are kept). */
export function normalizeCommand(input: string): string {
  // Decimal separators between digits ("3.5", "3,5") are kept; other punctuation becomes a space.
  const digit = (s: string, i: number) => /\d/.test(s[i] ?? '');
  let text = normalizeVi(input).replace(/[.,?!;:"“”'()[\]]/g, (ch, offset: number, s: string) =>
    (ch === '.' || ch === ',') && digit(s, offset - 1) && digit(s, offset + 1) ? ch : ch === ',' ? ' , ' : ' ',
  );
  text = ` ${squash(text)} `;
  for (const filler of [
    'lam on',
    'vui long',
    'xin',
    'hay',
    'giup toi',
    'giup minh',
    'giup',
    'cho toi',
    'cho minh',
    'nhe',
    'nha',
    'di',
    'duoc khong',
    'voi',
    'tren mo hinh',
    'trong mo hinh',
    'tren khung nhin',
    'cua du an',
  ])
    text = text.replace(new RegExp(`\\s${filler.replace(/\s+/g, '\\s+')}(?=\\s)`, 'g'), ' ');
  return squash(text.replace(/^\s*,|,\s*$/g, ''));
}

// ── storeys ──────────────────────────────────────────────────────────────────────────────────────────────────────
interface StoreyMatch {
  storey: string;
  rest: string;
}

/** Take one "tầng N" / "hầm N" / "tầng hầm N" / "tầng <tên tầng>" out of the text. */
export function takeStorey(text: string, storeys?: string[]): StoreyMatch | null | 'many' {
  const basement = /(?:^|\s)(?:o\s+|tai\s+)?(?:tang\s+ham\s*(?:b\s*)?|ham\s*(?:b\s*)?|tang\s+b\s*)0*(\d{1,3})(?=\s|$)/;
  const floor = /(?:^|\s)(?:o\s+|tai\s+)?(?:tang|lau|level)\s*(?:so\s*)?(?:t|l)?\s*0*(\d{1,3})(?=\s|$)/;
  const count = [...text.matchAll(new RegExp(basement.source, 'g')), ...text.matchAll(new RegExp(floor.source, 'g'))];
  if (count.length > 1) return 'many';
  const b = text.match(basement);
  if (b) return { storey: `B${Number(b[1])}`, rest: squash(text.replace(b[0], ' ')) };
  const f = text.match(floor);
  if (f) return { storey: String(Number(f[1])), rest: squash(text.replace(f[0], ' ')) };
  // A named storey of the loaded models: "tầng mái", "tầng trệt" when the model has such a storey.
  const named = (storeys ?? [])
    .map((name) => ({ name, key: normalizeVi(name).replace(/^tang\s+/, '') }))
    .filter((s) => s.key)
    .sort((x, y) => y.key.length - x.key.length)
    .find((s) => hasWord(text, `tang ${s.key}`));
  if (named) return { storey: named.name, rest: removeWord(text, `tang ${named.key}`) };
  return null;
}

const checkStorey = (storey: string, ctx: QuickCommandContext): string | null => {
  if (!ctx.storeys?.length) return null;
  if (ctx.storeys.some((name) => matchesStorey(name, storey) || name === storey)) return null;
  return `Không có tầng ${storey} trong mô hình đang nạp. Các tầng: ${ctx.storeys.slice(0, 15).join(', ')}${
    ctx.storeys.length > 15 ? '…' : ''
  }.`;
};

// ── categories ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface ResolvedCategory {
  /** IFC classes to act on (present in the model when the context lists categories). */
  classes: string[];
  label: string;
}

const LEADING = /^(cac|nhung|toan bo|tat ca|tat ca cac|moi|cau kien|doi tuong|loai)\s+/;
const stripLeading = (phrase: string) => {
  let out = squash(phrase);
  for (let i = 0; i < 3 && LEADING.test(out); i++) out = out.replace(LEADING, '');
  return out;
};
const LABEL_PARTS: [string, string][] = Object.entries(ifcLabels).flatMap(([cls, label]) =>
  normalizeVi(label)
    .split('/')
    .map((part) => [part.trim(), cls] as [string, string])
    .filter(([part]) => part.length > 1),
);

/**
 * A dictionary synonym that is another synonym plus words ("cột tròn", "cột thép", "cửa chống cháy") names a subset
 * the viewer cannot filter by category: return the base synonym and the qualifier so the command is refused.
 */
export function qualifiedSynonym(phrase: string): { base: string; qualifier: string; label: string } | null {
  const text = stripLeading(phrase);
  const match = matchBimCategory(text);
  if (!match || match.phrase !== text) return null;
  const base = match.mapping.synonyms
    .map((s) => normalizeVi(s))
    .filter((s) => s !== text && text.startsWith(`${s} `))
    .sort((a, b) => b.length - a.length)[0];
  return base ? { base, qualifier: text.slice(base.length + 1), label: match.mapping.canonicalVi } : null;
}

/** Whole-phrase category match; null when the phrase is not exactly a known category. */
export function resolveCategoryPhrase(phrase: string): ResolvedCategory | null {
  const text = stripLeading(phrase);
  if (!text) return null;
  if (/^ifc[a-z]+$/.test(text)) return { classes: [text.toUpperCase()], label: getIfcLabel(text) };
  const match = matchBimCategory(text);
  if (match && match.phrase === text && !qualifiedSynonym(text))
    return {
      classes: match.mapping.ifcClasses.filter((cls) => !cls.endsWith('TYPE')),
      label: match.mapping.canonicalVi,
    };
  const byLabel = [...new Set(LABEL_PARTS.filter(([part]) => part === text).map(([, cls]) => cls))];
  if (byLabel.length) return { classes: byLabel, label: getIfcLabel(byLabel[0]) };
  return null;
}

/** Labels of the categories present in the model, for "not found" messages. */
const presentLabels = (ctx: QuickCommandContext) =>
  [...new Set((ctx.categories ?? []).map((cls) => getIfcLabel(cls)))].slice(0, 12).join(', ');

const scopeToModel = (category: ResolvedCategory, ctx: QuickCommandContext): ResolvedCategory | string => {
  if (!ctx.categories) return category;
  const present = new Set(ctx.categories.map((cls) => cls.toUpperCase()));
  const classes = category.classes.filter((cls) => present.has(cls));
  if (classes.length) return { ...category, classes };
  return `Mô hình đang nạp không có ${category.label.toLowerCase()}.${
    ctx.categories.length ? ` Các loại có trong mô hình: ${presentLabels(ctx)}.` : ''
  }`;
};

interface Segment {
  category: ResolvedCategory;
  color?: string;
}

/** "cột màu đỏ", "đỏ cột", "cột" → category + optional colour. */
function parseSegment(raw: string, withColor: boolean): Segment | null {
  const text = squash(raw.replace(/^mau\s+/, ''));
  const hex = text.match(/#[0-9a-f]{6}(?=\s|$)/)?.[0];
  if (hex) {
    const category = resolveCategoryPhrase(squash(text.replace(hex, ' ').replace(/(^|\s)mau(?=\s|$)/g, ' ')));
    return category && withColor ? { category, color: hex } : null;
  }
  const whole = resolveCategoryPhrase(text);
  if (whole) return { category: whole };
  if (!withColor) return null;
  for (const [word, color] of COLOR_WORDS) {
    for (const pattern of [`mau ${word}`, word]) {
      if (!hasWord(text, pattern)) continue;
      const category = resolveCategoryPhrase(removeWord(text, pattern));
      if (category) return { category, color };
    }
  }
  return null;
}

type ElementVerb = 'isolate' | 'hide' | 'highlight' | 'xray';
const ELEMENT_VERBS: [RegExp, ElementVerb][] = [
  [/^(to mau|to|danh dau|lam noi bat|lam noi)\s+/, 'highlight'],
  [/^(x-?ray|nhin xuyen thau|xuyen thau)\s+/, 'xray'],
  [/^(chi hien thi|chi hien|chi xem|chi giu|co lap|loc|hien thi|hien|xem)\s+/, 'isolate'],
  [/^(an|giau|tat)\s+/, 'hide'],
];
const TOOL_OF: Record<ElementVerb, string> = {
  isolate: 'viewer_isolate_elements',
  hide: 'viewer_hide_elements',
  highlight: 'viewer_highlight_elements',
  xray: 'viewer_xray_elements',
};

// ── fixed phrases ────────────────────────────────────────────────────────────────────────────────────────────────
const VIEW_WORDS: [RegExp, string][] = [
  [/^(tu tren|tu tren xuong|xuong|mat bang|top|tren xuong|bang)$/, 'top'],
  [/^(tu duoi|tu duoi len|duoi len|bottom|mat day)$/, 'bottom'],
  [/^(mat truoc|phia truoc|tu truoc|truoc|front|mat dung truoc|chinh dien)$/, 'front'],
  [/^(mat sau|phia sau|tu sau|sau|back|mat dung sau)$/, 'back'],
  [/^(ben trai|phia trai|tu trai|mat trai|trai|left)$/, 'left'],
  [/^(ben phai|phia phai|tu phai|mat phai|phai|right)$/, 'right'],
  [/^(phoi canh|3d|iso|tong the|toan canh|truc do)$/, 'iso'],
];
const DISCIPLINES: [RegExp, string][] = [
  [/^(kien truc va ket cau|ket cau va kien truc|kien truc ket cau|kt va kc)$/, 'KIEN_TRUC_VA_KET_CAU'],
  [/^(kien truc|kt)$/, 'KIEN_TRUC'],
  [/^(ket cau|kc)$/, 'KET_CAU'],
  [/^(mep|co dien|co dien mep|he thong co dien)$/, 'MEP'],
  [/^(tat ca bo mon|moi bo mon|toan bo bo mon|tat ca mo hinh|toan bo mo hinh)$/, 'TAT_CA'],
];
const findDiscipline = (phrase: string) => {
  const text = squash(phrase.replace(/^(mo hinh|bo mon|phan)\s+/, ''));
  return DISCIPLINES.find(([pattern]) => pattern.test(text))?.[1] ?? null;
};

const guidIn = (input: string) => input.match(/(?:^|[^0-9A-Za-z_$])([0-9A-Za-z_$]{22})(?=$|[^0-9A-Za-z_$])/)?.[1];
const viewNameIn = (input: string) =>
  input
    .normalize('NFC')
    .match(/(?:góc|goc)\s+(?:nhìn|nhin)(?:\s+(?:đã|da)\s+(?:lưu|luu))?\s*[:“"]?\s*(.+?)[”"]?\s*$/i)?.[1]
    ?.trim();

/** Parse a Vietnamese viewer command into tool calls. */
export function parseQuickCommand(input: string, ctx: QuickCommandContext = {}): QuickCommandResult {
  const text = normalizeCommand(input);
  if (!text) return notUnderstood(help('Nhập một lệnh cho mô hình.'));

  // Undo / show all
  if (/^(hoan tac|undo|quay lai|tro lai)(\s+(thao tac|buoc|lenh))?(\s+(truoc|vua roi|gan nhat|vua xong))?$/.test(text))
    return understood([{ name: 'viewer_undo', args: {} }]);
  if (
    /^((hien|hien thi|mo|xem)(\s+lai)?\s+(tat ca|toan bo|het)(\s+(mo hinh|cau kien|doi tuong))?|hien lai|(bo|huy|xoa)\s+(het\s+)?(co lap|an|loc|mau|mau to|to mau|x-?ray|xuyen thau)|xoa mau|reset|dat lai|khoi phuc)$/.test(
      text,
    )
  )
    return understood([{ name: 'viewer_show_all', args: {} }]);

  // Camera presets
  const viewRest = text.replace(
    /^(nhin|xem|goc nhin|huong nhin|chuyen\s+(sang|ve)|dat\s+(goc|huong)\s+nhin|camera)\s*/,
    '',
  );
  if (viewRest !== text || /^(mat bang|phoi canh|3d|iso)$/.test(text)) {
    const preset = VIEW_WORDS.find(([pattern]) =>
      pattern.test(squash(viewRest.replace(/^(mo hinh|goc|huong)\s+/, ''))),
    )?.[1];
    if (preset) return understood([{ name: 'viewer_set_view', args: { preset } }]);
  }

  // Sections
  if (/^(tat|bo|huy|xoa|dong)\s+(mat cat|cat|mat phang cat)$/.test(text))
    return understood([{ name: 'viewer_set_section', args: { tat: true } }]);
  if (/^(tat|bo|huy|xoa|dong)\s+hop cat$/.test(text))
    return understood([{ name: 'viewer_set_section_box', args: { tat: true } }]);
  if (/^(cat|mat cat|cat ngang)(\s+ngang)?(\s+(o|tai))?\s+giua(\s+mo hinh)?$/.test(text))
    return understood([{ name: 'viewer_set_section', args: { axis: 'y', position: 0.5 } }]);
  const box = text.match(/^(hop cat|cat hop|khoanh vung)(\s+quanh)?\s+(.+)$/);
  const plane = text.match(/^(mat cat|cat ngang|cat)(\s+ngang)?\s+(.+)$/);
  if (box || plane) {
    const rest = (box ?? plane)![3];
    const elevation = rest.match(/^(?:(?:o|tai)\s+)?(?:cao do|do cao|cote)\s*(-?\d+(?:[.,]\d+)?)\s*m?$/);
    if (plane && !box && elevation)
      return understood([{ name: 'viewer_set_section', args: { cao_do_m: Number(elevation[1].replace(',', '.')) } }]);
    const storey = takeStorey(rest, ctx.storeys);
    if (storey === 'many') return notUnderstood('Chỉ cắt một tầng mỗi lần, ví dụ “cắt tầng 2”.');
    if (storey) {
      const offset = storey.rest.match(/^(?:cao|o do cao|tren san)\s*(\d+(?:[.,]\d+)?)\s*m?$/);
      if (storey.rest && !offset) return notUnderstood(help(`Chưa hiểu phần “${storey.rest}” trong lệnh cắt.`));
      const problem = checkStorey(storey.storey, ctx);
      if (problem) return notUnderstood(problem);
      return understood([
        box
          ? { name: 'viewer_set_section_box', args: { tang: storey.storey } }
          : {
              name: 'viewer_set_section',
              args: {
                tang: storey.storey,
                ...(offset ? { do_cao_tren_san_m: Number(offset[1].replace(',', '.')) } : {}),
              },
            },
      ]);
    }
    if (box) return notUnderstood('Hộp cắt cần một tầng, ví dụ “hộp cắt tầng 3”.');
    // "cắt" without a storey or height falls through (it is not an element verb either)
    return notUnderstood(
      'Lệnh cắt cần tầng hoặc cao độ: “cắt tầng 2”, “cắt ở cao độ 3.5 m”, “cắt ở giữa”, “tắt mặt cắt”.',
    );
  }

  // Saved views, clash clusters, measuring, fly to
  if (/^(danh sach|liet ke|cac|xem cac|xem danh sach)\s+goc nhin(\s+da luu)?$/.test(text))
    return understood([{ name: 'viewer_list_saved_views', args: {} }]);
  if (/^(luu|ghi)\s+goc nhin(\s+hien tai)?(\s+(ten|la))?\s+\S/.test(text)) {
    const name = viewNameIn(input)
      ?.replace(/^(?:hiện tại|hien tai)\s+/i, '')
      .replace(/^(?:tên|ten|là|la)\s+/i, '');
    if (name) return understood([{ name: 'viewer_save_view', args: { ten: name } }]);
  }
  if (/^(ap|ap dung|mo|dung|chuyen sang|ve|xem)\s+goc nhin\s+\S/.test(text)) {
    const name = viewNameIn(input);
    if (name) return understood([{ name: 'viewer_apply_view', args: { ten: name } }]);
  }
  const cluster = text.match(/^(xem\s+|hien\s+|mo\s+|toi\s+)?cum va cham(\s+so)?\s+(\d{1,4})$/);
  if (cluster) return understood([{ name: 'viewer_show_clash_cluster', args: { cum: Number(cluster[3]) } }]);
  if (/^do\s+(khoang cach|khoang ho)(\s+giua)?(\s+(hai|2))?(\s+cau kien)?(\s+dang chon)?$/.test(text))
    return understood([{ name: 'viewer_measure_distance', args: {} }]);
  if (/^(bay toi|bay den|di toi|den|toi|zoom toi|phong to)\s/.test(text)) {
    const guid = guidIn(input);
    if (guid) return understood([{ name: 'viewer_fly_to_element', args: { guid } }]);
  }

  // Element and discipline verbs
  const verb = ELEMENT_VERBS.find(([pattern]) => pattern.test(text));
  if (!verb) return notUnderstood(help(`Chưa hiểu lệnh “${input.trim()}”.`));
  const [pattern, kind] = verb;
  let rest = squash(text.replace(pattern, ''));

  // Disciplines: "chỉ hiện kết cấu", "ẩn kiến trúc", "hiện MEP"
  const discipline = findDiscipline(rest);
  if (discipline && kind !== 'highlight' && kind !== 'xray') {
    const only = kind === 'isolate' && /^(chi|co lap|loc)/.test(text);
    return understood([
      {
        name: 'viewer_toggle_discipline',
        args: { bo_mon: discipline, hien_thi: kind !== 'hide', ...(only ? { chi_hien_bo_mon_nay: true } : {}) },
      },
    ]);
  }

  const storey = takeStorey(rest, ctx.storeys);
  if (storey === 'many') return notUnderstood('Mỗi lệnh chỉ áp cho một tầng, ví dụ “cô lập dầm tầng 3”.');
  if (storey) {
    const problem = checkStorey(storey.storey, ctx);
    if (problem) return notUnderstood(problem);
    rest = storey.rest;
  }
  const withColor = kind === 'highlight' || kind === 'xray';
  const parts = rest
    .split(/\s*(?:,|\+|(?:^|\s)va(?=\s|$)|(?:^|\s)cung(?=\s|$))\s*/)
    .map(squash)
    .filter(Boolean);
  if (!parts.length) return notUnderstood(help('Cần loại cấu kiện, ví dụ “chỉ hiện cột”.'));
  const segments: Segment[] = [];
  for (const part of parts) {
    const segment = parseSegment(part, withColor);
    if (!segment) {
      const qualified = qualifiedSynonym(part);
      if (qualified)
        return notUnderstood(
          `Lệnh nhanh chưa lọc được “${qualified.qualifier}”: chỉ chọn được toàn bộ ${qualified.label.toLowerCase()}. Điều kiện chi tiết cần Trợ lý BuildSIA.`,
        );
      const known = presentLabels(ctx);
      return notUnderstood(
        `Không nhận ra loại cấu kiện “${part}”.${known ? ` Các loại có trong mô hình: ${known}.` : ''} ${help('')}`.trim(),
      );
    }
    const scoped = scopeToModel(segment.category, ctx);
    if (typeof scoped === 'string') return notUnderstood(scoped);
    segments.push({ ...segment, category: scoped });
  }
  // A bare colour on its own ("tô cột và dầm màu đỏ") colours every segment.
  const tang = storey ? { tang: storey.storey } : {};
  const loai = (segment: Segment) => segment.category.classes.join(',');

  if (kind === 'highlight') {
    if (segments.length === 1)
      return understood([
        {
          name: TOOL_OF.highlight,
          args: { loai_cau_kien: loai(segments[0]), color: segments[0].color ?? PALETTE[0], ...tang },
        },
      ]);
    const shared = segments[segments.length - 1].color && segments.slice(0, -1).every((s) => !s.color);
    return understood([
      {
        name: TOOL_OF.highlight,
        args: {
          danh_sach: segments.map((segment, i) => ({
            loai_cau_kien: loai(segment),
            color: (shared ? segments[segments.length - 1].color : segment.color) ?? PALETTE[i % PALETTE.length],
          })),
          ...tang,
        },
      },
    ]);
  }
  if (kind !== 'xray' && segments.some((segment) => segment.color))
    return notUnderstood('Màu chỉ dùng với lệnh “tô màu” hoặc “x-ray”, ví dụ “tô màu cột màu đỏ”.');
  const color = segments.find((segment) => segment.color)?.color;
  return understood([
    {
      name: TOOL_OF[kind],
      args: {
        loai_cau_kien: [...new Set(segments.flatMap((segment) => segment.category.classes))].join(','),
        ...(color ? { color } : {}),
        ...tang,
      },
    },
  ]);
}

/** Categories of the dictionary, for suggestion lists. */
export const DICTIONARY_CATEGORY_LABELS = Object.values(VIETNAMESE_BIM_CATEGORIES).map((c) => c.canonicalVi);
