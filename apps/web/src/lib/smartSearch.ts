// ============================================================
// 🔎 Smart Search — Tìm kiếm thông minh không dấu, đa từ khóa, hỗ trợ viết tắt
// ============================================================
// Mục tiêu: người dùng KHÔNG cần gõ đúng và liền mạch cả cụm.
//   "Cty CP CIC"      → khớp "Công ty Cổ phần Công nghệ và Tư vấn CIC"
//   "công nghệ CIC"   → khớp "Công ty Cổ phần Công nghệ và Tư vấn CIC"
//   "cic tu van"      → khớp (không cần đúng thứ tự)
//   "ctcp cic"        → khớp (viết tắt chữ cái đầu)
//
// Nguyên tắc:
//   1. Chuẩn hóa bỏ dấu + hạ chữ thường + bỏ ký tự đặc biệt.
//   2. "Bồi" thêm biến thể viết tắt/viết đầy đủ vào chuỗi đích (2 chiều).
//   3. Tách câu tìm kiếm thành nhiều token, khớp kiểu AND, KHÔNG cần đúng thứ tự.
//   4. Token loại hình pháp nhân (cty, cp, tnhh...) chỉ tính điểm, không bắt buộc khớp.
//   5. Chấm điểm độ khớp để đẩy kết quả sát nghĩa nhất lên ĐẦU danh sách.
// ============================================================

import { removeDiacritics } from './formatters';

/**
 * Chuẩn hóa chuỗi phục vụ tìm kiếm: bỏ dấu, chữ thường, ký tự đặc biệt → khoảng trắng
 * Ví dụ: "Công ty CP Tư vấn (CIC)" → "cong ty cp tu van cic"
 */
export function normalizeSearchText(input?: string | null): string {
    if (input === null || input === undefined) return '';
    return removeDiacritics(String(input))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Từ điển viết tắt tiếng Việt (dạng đầy đủ ↔ dạng viết tắt).
 * Áp dụng 2 chiều: dữ liệu ghi đầy đủ vẫn tìm được bằng viết tắt và ngược lại.
 */
const PHRASE_ALIASES: ReadonlyArray<readonly [string, string]> = [
    // Loại hình pháp nhân
    ['cong ty', 'cty'],
    ['co phan', 'cp'],
    ['trach nhiem huu han', 'tnhh'],
    ['mot thanh vien', 'mtv'],
    ['doanh nghiep tu nhan', 'dntn'],
    ['doanh nghiep', 'dn'],
    ['tap doan', 'td'],
    ['tong cong ty', 'tct'],
    ['van phong dai dien', 'vpdd'],
    ['van phong', 'vp'],
    ['hop tac xa', 'htx'],
    ['chi nhanh', 'cn'],
    // Ngành nghề / lĩnh vực
    ['xay dung', 'xd'],
    ['tu van', 'tv'],
    ['cong nghe', 'cn'],
    ['cong nghe thong tin', 'cntt'],
    ['thuong mai', 'tm'],
    ['dich vu', 'dv'],
    ['san xuat', 'sx'],
    ['dau tu', 'dt'],
    ['ky thuat', 'kt'],
    ['thiet ke', 'tk'],
    ['xuat nhap khau', 'xnk'],
    ['phat trien', 'pt'],
    ['giao thong van tai', 'gtvt'],
    ['giao thong', 'gt'],
    ['nong nghiep', 'nn'],
    ['moi truong', 'mt'],
    ['ha tang', 'ht'],
    ['do thi', 'dt'],
    ['thuy loi', 'tl'],
    ['dien luc', 'dl'],
    ['vien thong', 'vt'],
    ['thong tin', 'tt'],
    ['giai phap', 'gp'],
    ['phan mem', 'pm'],
    ['tu dong hoa', 'tdh'],
    // Cơ quan / tổ chức
    ['uy ban nhan dan', 'ubnd'],
    ['hoi dong nhan dan', 'hdnd'],
    ['ban quan ly du an', 'bqlda'],
    ['ban quan ly', 'bql'],
    ['so xay dung', 'sxd'],
    ['nha nuoc', 'nn'],
    ['trung tam', 'tt'],
    ['vien nghien cuu', 'vnc'],
    ['dai hoc', 'dh'],
    // Địa danh
    ['viet nam', 'vn'],
    ['ha noi', 'hn'],
    ['thanh pho ho chi minh', 'tphcm'],
    ['ho chi minh', 'hcm'],
    ['sai gon', 'sg'],
    ['da nang', 'dn'],
    ['hai phong', 'hp'],
    ['can tho', 'ct'],
    // Nghiệp vụ CIC ERP
    ['hop dong', 'hd'],
    ['khach hang', 'kh'],
    ['nha cung cap', 'ncc'],
    ['du an', 'da'],
    ['nhan su', 'ns'],
    ['bao gia', 'bg'],
    ['thanh toan', 'tt'],
    ['de xuat', 'dx'],
    ['phuong an kinh doanh', 'pakd'],
    ['kinh doanh', 'kd'],
    ['ke hoach', 'kh'],
    ['bien ban', 'bb'],
    ['nghiem thu', 'nt'],
    ['don vi', 'dv'],
    // Nghiệp vụ Thẩm định & Quản lý Xây dựng (Sở Xây dựng Điện Biên)
    ['tham dinh', 'td'],
    ['chu dau tu', 'cdt'],
    ['tong muc dau tu', 'tmdt'],
    ['giay phep xay dung', 'gpxd'],
    ['thiet ke co so', 'tkcs'],
    ['thiet ke ban ve thi cong', 'bvtc'],
    ['quy chuan ky thuat', 'qcvn'],
    ['quy chuan', 'qc'],
    ['tieu chuan viet nam', 'tcvn'],
    ['tieu chuan', 'tc'],
    ['phong chay chua chay', 'pccc'],
    ['cuu nan cuu ho', 'cnch'],
    ['bao cao nghien cuu kha thi', 'bcnckt'],
    ['kinh te ky thuat', 'ktkt'],
    ['quan ly du an', 'qlda'],
    ['quan ly do thi', 'qldt'],
    ['ho so', 'hs'],
    ['dien bien', 'db'],
    ['san pham', 'sp'],
    ['ban quyen', 'bq'],
    ['giay phep', 'gp'],
    ['bao hanh', 'bh'],
    ['bao tri', 'bt'],
];

/**
 * Token chung chung của tên pháp nhân — chỉ dùng để cộng điểm ưu tiên,
 * không bắt buộc phải khớp (tránh gõ "Cty CP CIC" lại loại mất "CIC JSC").
 */
const GENERIC_TOKENS = new Set([
    'cong', 'ty', 'cty', 'co', 'phan', 'cp', 'tnhh', 'mtv', 'dn', 'dntn',
    'tct', 'htx', 'the', 'and', 'jsc', 'ltd', 'llc', 'corp', 'corporation',
    'company', 'group', 'inc', 'joint', 'stock', 'va', 'cua', 'thuoc',
]);

/** Từ nối bỏ qua khi dựng chữ cái đầu (acronym) */
const ACRONYM_SKIP = new Set(['va', 'cua', 'voi', 'cho', 'the', 'and', 'of']);

interface PreparedText {
    /** Chuỗi chuẩn hóa gốc */
    norm: string;
    /** Chuỗi chuẩn hóa + biến thể viết tắt/đầy đủ được bồi thêm */
    augmented: string;
    /** Bản augmented có đệm khoảng trắng 2 đầu — kiểm tra khớp đầu từ */
    padded: string;
    /** Chữ cái đầu mọi từ: "cong ty co phan cic" → "ctcpcic" */
    acronym: string;
    /** Chữ cái đầu, bỏ qua từ nối */
    acronymShort: string;
    /** Chỉ giữ chữ số — khớp SĐT / MST gõ liền */
    digits: string;
}

const PREPARED_CACHE = new Map<string, PreparedText>();
const CACHE_LIMIT = 5000;

function containsPhrase(paddedNorm: string, phrase: string): boolean {
    return paddedNorm.indexOf(` ${phrase} `) !== -1;
}

function buildAcronym(norm: string, skipStopWords: boolean): string {
    const words = norm.split(' ');
    let out = '';
    for (const w of words) {
        if (!w) continue;
        if (skipStopWords && ACRONYM_SKIP.has(w)) continue;
        out += w.charAt(0);
    }
    return out;
}

/** Chuẩn bị (và cache) toàn bộ biến thể so khớp của một chuỗi đích */
export function prepareSearchText(raw: string): PreparedText {
    const cached = PREPARED_CACHE.get(raw);
    if (cached) return cached;

    const norm = normalizeSearchText(raw);
    const padded = ` ${norm} `;
    let extra = '';
    for (const [full, abbr] of PHRASE_ALIASES) {
        if (containsPhrase(padded, full)) {
            extra += ` ${abbr}`;
        } else if (containsPhrase(padded, abbr)) {
            extra += ` ${full}`;
        }
    }

    const augmented = extra ? norm + extra : norm;
    const prepared: PreparedText = {
        norm,
        augmented,
        padded: ` ${augmented} `,
        acronym: buildAcronym(norm, false),
        acronymShort: buildAcronym(norm, true),
        digits: norm.replace(/[^0-9]/g, ''),
    };

    if (PREPARED_CACHE.size >= CACHE_LIMIT) PREPARED_CACHE.clear();
    PREPARED_CACHE.set(raw, prepared);
    return prepared;
}

export interface PreparedQuery {
    raw: string;
    norm: string;
    /** Token bắt buộc phải khớp */
    required: string[];
    /** Token chung chung (cty, cp, tnhh...) — chỉ cộng điểm */
    optional: string[];
    /** Chuỗi bỏ khoảng trắng — khớp chữ cái đầu */
    compact: string;
    isEmpty: boolean;
}

const QUERY_CACHE = new Map<string, PreparedQuery>();

/** Tách câu tìm kiếm thành các token bắt buộc / tùy chọn */
export function prepareSearchQuery(query?: string | null): PreparedQuery {
    const raw = (query ?? '').trim();
    const cached = QUERY_CACHE.get(raw);
    if (cached) return cached;

    const norm = normalizeSearchText(raw);
    const tokens = norm.split(' ').filter(Boolean);
    const required: string[] = [];
    const optional: string[] = [];
    for (const t of tokens) {
        if (GENERIC_TOKENS.has(t)) optional.push(t);
        else required.push(t);
    }
    // Nếu toàn bộ đều là token chung chung (gõ mỗi "cty") thì vẫn phải lọc theo chúng
    if (required.length === 0 && optional.length > 0) {
        required.push(...optional.splice(0, optional.length));
    }

    const prepared: PreparedQuery = {
        raw,
        norm,
        required,
        optional,
        compact: norm.replace(/ /g, ''),
        isEmpty: tokens.length === 0,
    };

    if (QUERY_CACHE.size >= 300) QUERY_CACHE.clear();
    QUERY_CACHE.set(raw, prepared);
    return prepared;
}

/**
 * Token có xuất hiện trong chuỗi đích không (kể cả dạng số gõ liền).
 *
 * Token NGẮN (≤ 2 ký tự) bắt buộc khớp ở ĐẦU MỘT TỪ: nếu cho khớp giữa từ thì
 * gõ "sap ad" (ý là SAP2000 Advanced) sẽ lôi về cả "stCAD" — vì "ad" nằm giữa
 * chữ "stcad". Token từ 3 ký tự trở lên vẫn khớp giữa từ ("cic" → "VINACICO").
 */
function tokenHits(token: string, target: PreparedText): boolean {
    if (token.length <= 2) {
        return target.padded.indexOf(` ${token}`) !== -1;
    }
    if (target.augmented.indexOf(token) !== -1) return true;
    // SĐT / MST / CCCD lưu tách nhóm — chỉ áp dụng cho chuỗi số dài (≥ 7 chữ số).
    // Tránh ghép chữ số từ các từ rời rạc ("1 năm" + "067" → "1067" khớp sai "106").
    if (token.length >= 7 && /^[0-9]+$/.test(token) && target.digits.indexOf(token) !== -1) return true;
    return false;
}

/** Token khớp ngay ĐẦU một từ (tín hiệu liên quan cao hơn khớp giữa từ) */
function tokenHitsAtWordStart(token: string, target: PreparedText): boolean {
    return target.padded.indexOf(` ${token}`) !== -1;
}

/** Điểm khớp riêng cho từng trường dữ liệu — dùng để xếp hạng */
function scoreSingleField(q: PreparedQuery, target: PreparedText): number {
    if (!target.norm) return 0;

    if (target.norm === q.norm) return 1000;                     // trùng khít tuyệt đối
    if (target.norm.startsWith(q.norm)) return 850;              // khớp ngay từ đầu chuỗi
    if (target.padded.indexOf(` ${q.norm}`) !== -1) return 700;  // nguyên cụm, khớp đầu từ
    if (target.augmented.indexOf(q.norm) !== -1) return 600;     // nguyên cụm, khớp giữa từ

    let allHit = true;
    let allAtWordStart = true;
    for (const token of q.required) {
        if (!tokenHits(token, target)) { allHit = false; break; }
        if (!tokenHitsAtWordStart(token, target)) allAtWordStart = false;
    }
    if (!allHit) return 0;
    return allAtWordStart ? 450 : 300;
}

/**
 * So khớp thông minh giữa câu tìm kiếm và các trường dữ liệu.
 * Trả về ĐIỂM: 0 = không khớp; càng cao = càng sát nghĩa (dùng để sắp xếp).
 * Trường đứng trước (thường là Tên) được ưu tiên hơn trường đứng sau.
 */
export function smartSearchScore(query: string | null | undefined, ...fields: Array<string | null | undefined>): number {
    const q = prepareSearchQuery(query);
    if (q.isEmpty) return 1;

    const values: string[] = [];
    for (const f of fields) {
        if (f === null || f === undefined) continue;
        const s = String(f);
        if (s) values.push(s);
    }
    if (values.length === 0) return 0;

    const combined = prepareSearchText(values.join(' | '));
    if (!combined.norm) return 0;

    // Điều kiện khớp: mọi token bắt buộc đều xuất hiện (gộp toàn bộ các trường)
    let allRequired = true;
    for (const token of q.required) {
        if (!tokenHits(token, combined)) { allRequired = false; break; }
    }

    if (!allRequired) {
        // Dự phòng: khớp theo chữ cái đầu — "ctcp cic", "bqlda" (chỉ áp dụng cho chữ cái thuần túy, không áp dụng cho số)
        if (q.compact.length >= 3 && /^[a-z]+$/.test(q.compact) &&
            (combined.acronym.indexOf(q.compact) !== -1 || combined.acronymShort.indexOf(q.compact) !== -1)) {
            return 30;
        }
        return 0;
    }

    // Xếp hạng: lấy điểm cao nhất trong các trường, trường đầu có trọng số lớn hơn
    let best = 0;
    for (let i = 0; i < values.length; i++) {
        const weight = Math.max(0.55, 1 - i * 0.12);
        const s = scoreSingleField(q, prepareSearchText(values[i])) * weight;
        if (s > best) best = s;
    }

    let score = 100 + best;
    for (const token of q.optional) {
        if (tokenHits(token, combined)) score += 8;  // khớp thêm "cty", "cp"...
    }
    // Chuỗi đích càng ngắn (càng ít nhiễu) càng ưu tiên khi đồng điểm
    score += Math.max(0, 40 - Math.floor(combined.norm.length / 8));
    return score;
}

/**
 * So khớp thông minh — dùng thay cho `removeDiacritics(x).includes(q)`.
 *
 * @example
 * items.filter(c => smartSearchMatch(searchTerm, c.name, c.shortName, c.taxCode))
 */
export function smartSearchMatch(query: string | null | undefined, ...fields: Array<string | null | undefined>): boolean {
    return smartSearchScore(query, ...fields) > 0;
}

/**
 * Lọc danh sách + SẮP XẾP theo độ khớp giảm dần (kết quả sát nhất lên đầu).
 * Giữ nguyên thứ tự gốc cho các mục đồng điểm.
 */
export function smartSearchFilter<T>(
    items: readonly T[],
    query: string | null | undefined,
    getFields: (item: T) => Array<string | null | undefined>,
    options?: { sortByScore?: boolean }
): T[] {
    const q = prepareSearchQuery(query);
    if (q.isEmpty) return items as T[];

    const scored: Array<{ item: T; score: number; index: number }> = [];
    items.forEach((item, index) => {
        const score = smartSearchScore(query, ...getFields(item));
        if (score > 0) scored.push({ item, score, index });
    });

    if (options?.sortByScore !== false) {
        scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    }
    return scored.map(s => s.item);
}

/**
 * Sắp xếp lại danh sách ĐÃ lọc (ví dụ kết quả trả về từ server) theo độ khớp.
 * Không loại bỏ phần tử nào — chỉ đổi thứ tự để mục sát nghĩa nhất lên đầu.
 */
export function sortBySearchRelevance<T>(
    items: readonly T[],
    query: string | null | undefined,
    getFields: (item: T) => Array<string | null | undefined>
): T[] {
    const q = prepareSearchQuery(query);
    if (q.isEmpty || items.length < 2) return items as T[];
    return (items as T[])
        .map((item, index) => ({ item, index, score: smartSearchScore(query, ...getFields(item)) }))
        .sort((a, b) => (b.score - a.score) || (a.index - b.index))
        .map(s => s.item);
}

// ============================================================
// 🗄️ Hỗ trợ tìm kiếm phía Server (Supabase / PostgREST)
// ============================================================

/** Loại bỏ ký tự phá vỡ cú pháp filter của PostgREST */
function sanitizeIlikeToken(token: string): string {
    return token.replace(/[,()%*\\'"]/g, '').trim();
}

/**
 * Tách câu tìm kiếm thành các token GIỮ NGUYÊN DẤU để dùng với `.ilike`.
 * (Việc bỏ dấu do RPC `f_search_match` trên Postgres đảm nhiệm.)
 */
export function splitSearchTokensForIlike(query?: string | null): string[] {
    if (!query) return [];
    return query
        .trim()
        .split(/\s+/)
        .map(sanitizeIlikeToken)
        .filter(t => t.length > 0);
}

/**
 * Áp bộ lọc tìm kiếm ĐA TOKEN lên query Supabase.
 * Mỗi token sinh 1 mệnh đề `.or(...)` riêng ⇒ các token nối nhau bằng AND,
 * nhờ vậy gõ "CIC tư vấn" hay "tư vấn CIC" đều ra kết quả.
 *
 * @example
 * dbQuery = applySmartIlikeFilter(dbQuery, ['name', 'short_name', 'tax_code'], q);
 */
export function applySmartIlikeFilter<T extends { or: (filter: string) => T }>(
    builder: T,
    columns: string[],
    query?: string | null,
    maxTokens: number = 4
): T {
    const tokens = splitSearchTokensForIlike(query).slice(0, maxTokens);
    if (tokens.length === 0 || columns.length === 0) return builder;

    let result = builder;
    for (const token of tokens) {
        result = result.or(columns.map(col => `${col}.ilike.%${token}%`).join(','));
    }
    return result;
}

/**
 * Dựng mệnh đề lọc ĐA TỪ KHÓA cho một lần gọi `.or()` của PostgREST.
 *
 * 1 từ khóa : `name.ilike.%cic%,code.ilike.%cic%`
 * ≥2 từ khóa: `and(or(name.ilike.%cong nghe%,code...),or(name.ilike.%cic%,code...))`
 *             ⇒ mọi từ khóa đều phải khớp, KHÔNG cần đúng thứ tự.
 *
 * Dùng khi cần OR chung với mệnh đề khác (ví dụ `id.in.(...)` của Tag).
 * Nếu chỉ lọc thuần túy thì dùng {@link applySmartIlikeFilter} cho gọn.
 */
export function buildSmartTokenFilter(columns: string[], query?: string | null, maxTokens: number = 3): string {
    const tokens = splitSearchTokensForIlike(query).slice(0, maxTokens);
    if (tokens.length === 0 || columns.length === 0) return '';
    const orGroup = (token: string) => columns.map(col => `${col}.ilike.%${token}%`).join(',');
    if (tokens.length === 1) return orGroup(tokens[0]);
    return `and(${tokens.map(t => `or(${orGroup(t)})`).join(',')})`;
}

/**
 * Dựng chuỗi filter `.or()` đa cột cho 1 token (khi cần ghép thủ công thêm mệnh đề khác).
 */
export function buildSmartOrClause(columns: string[], token: string, extraClause?: string): string {
    const clauses = columns.map(col => `${col}.ilike.%${sanitizeIlikeToken(token)}%`);
    if (extraClause) clauses.push(extraClause);
    return clauses.join(',');
}
