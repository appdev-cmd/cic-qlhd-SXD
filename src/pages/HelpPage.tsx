import React, {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ExternalLink, Keyboard, LifeBuoy, ListTree, Square, SquareCheck } from 'lucide-react';
import guideSource from '../../docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md?raw';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { DataTable, type DataTableColumn } from '../components/ui/DataTable';
import { GridCount, GridSearchInput } from '../components/ui/grid/GridToolbar';
import { cn } from '../lib/utils';
import { matchesSmartSearch } from '../lib/smartSearch';
import {
  inlineText,
  parseMarkdown,
  splitSections,
  type Block,
  type DocSection,
  type DocSubsection,
  type Inline,
} from '../lib/markdown';

// Parsed once per bundle load; the guide is static content shipped with the app.
const SECTIONS = splitSections(parseMarkdown(guideSource));
/** The guide's own "Mục lục" section duplicates the sticky table of contents on wide screens. */
const DOC_TOC_ID = 'mục-lục';
const DOC_DIR = 'docs/';

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Mở tìm nhanh hồ sơ, dự án, trang — dùng được ở mọi màn hình.' },
  { keys: ['/'], label: 'Mở tìm nhanh khi không đang gõ trong ô nhập.' },
  { keys: ['↑', '↓', 'Enter'], label: 'Chọn và mở kết quả trong tìm nhanh.' },
  { keys: ['Esc'], label: 'Đóng hộp thoại hoặc khung đang mở trên cùng; panel phía dưới vẫn giữ nguyên.' },
  { keys: ['←', '→'], label: 'Chuyển sang tab bên cạnh khi đang chọn một tab.' },
  { keys: ['PageUp', 'PageDown'], label: 'Trang trước / trang sau trong khung xem A4 (Home, End: trang đầu, cuối).' },
];

interface VisibleSection {
  section: DocSection;
  showIntro: boolean;
  subsections: DocSubsection[];
}

/** Accent-insensitive section filter: whole section on a title match, otherwise only the matching parts. */
function filterSections(query: string): VisibleSection[] {
  const q = query.trim();
  const all = (section: DocSection): VisibleSection => ({ section, showIntro: true, subsections: section.subsections });
  if (!q) return SECTIONS.map(all);
  return SECTIONS.filter((s) => s.id !== DOC_TOC_ID && matchesSmartSearch(s.text, q)).map((section) => {
    if (matchesSmartSearch(section.title, q)) return all(section);
    const subsections = section.subsections.filter((s) => matchesSmartSearch(s.text, q));
    const showIntro = matchesSmartSearch(section.introText, q);
    // Query words spread over several parts: keep the whole section rather than hiding everything.
    if (!subsections.length && !showIntro) return all(section);
    return { section, showIntro, subsections };
  });
}

/** Resolves a guide-relative file link (e.g. `../output/x.zip`) to a repository path for display. */
function repoPath(href: string): string {
  const parts = (DOC_DIR + href).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

const GoToContext = createContext<(id: string) => void>(() => undefined);

const linkClass =
  'font-medium text-primary-700 dark:text-primary-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded';

function InlineView({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} />
      ))}
    </>
  );
}

function InlineNode({ node }: { node: Inline }) {
  const goTo = useContext(GoToContext);
  switch (node.type) {
    case 'text':
      return <>{node.text}</>;
    case 'break':
      return <br />;
    case 'code':
      return (
        <code className="rounded-md border border-border dark:border-slate-700 bg-subtle dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-ink dark:text-slate-100">
          {node.text}
        </code>
      );
    case 'strong':
      return (
        <strong className="font-semibold text-ink dark:text-slate-50">
          <InlineView nodes={node.children} />
        </strong>
      );
    case 'em':
      return (
        <em className="italic">
          <InlineView nodes={node.children} />
        </em>
      );
    case 'link': {
      const href = node.href;
      if (href.startsWith('#')) {
        const id = safeDecode(href.slice(1));
        return (
          <a
            href={'#' + encodeURIComponent(id)}
            onClick={(event) => {
              event.preventDefault();
              goTo(id);
            }}
            className={linkClass}
          >
            <InlineView nodes={node.children} />
          </a>
        );
      }
      if (/^https?:\/\//i.test(href))
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkClass, 'inline-flex items-center gap-1')}
          >
            <InlineView nodes={node.children} />
            <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
          </a>
        );
      // Repository files (other guides, sample packs) are not served by the app: show where to find them.
      return (
        <span>
          <InlineView nodes={node.children} />{' '}
          <span className="text-xs text-ink-muted dark:text-slate-400">
            (tệp <span className="font-mono">{repoPath(href)}</span> trong thư mục dự án)
          </span>
        </span>
      );
    }
  }
  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-xl font-bold text-ink dark:text-slate-50',
  2: 'mb-3 border-b border-border dark:border-slate-800 pb-2 text-lg font-bold text-ink dark:text-slate-50',
  3: 'mb-2 mt-6 text-base font-semibold text-ink dark:text-slate-100',
};

function HeadingView({ block }: { block: Extract<Block, { type: 'heading' }> }) {
  // The page title is the only h1; the guide's own title renders one level down.
  const Tag = ('h' + Math.min(Math.max(block.level, 2), 6)) as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag
      id={block.id}
      tabIndex={-1}
      data-help-heading={block.level === 2 || block.level === 3 ? '' : undefined}
      className={cn(
        'scroll-mt-4 focus:outline-none',
        HEADING_CLASS[block.level] || 'mb-2 mt-4 text-sm font-semibold text-ink dark:text-slate-100',
      )}
    >
      <InlineView nodes={block.inlines} />
    </Tag>
  );
}

interface TableRow {
  id: number;
  cells: Inline[][];
  sort: (string | number)[];
}

function TableView({ block, storageKey }: { block: Extract<Block, { type: 'table' }>; storageKey: string }) {
  const { rows, columns } = useMemo(() => {
    const rows: TableRow[] = block.rows.map((cells, id) => ({
      id,
      cells,
      sort: cells.map((cell) => {
        const text = inlineText(cell).trim();
        return text && /^\d+([.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : text;
      }),
    }));
    // Starting widths follow the average text length; fitWidth turns them into proportions.
    const columns: DataTableColumn<TableRow>[] = block.header.map((header, index) => {
      const lengths = [inlineText(header), ...block.rows.map((r) => inlineText(r[index] || []))].map((t) => t.length);
      const average = lengths.reduce((sum, n) => sum + n, 0) / Math.max(lengths.length, 1);
      return {
        id: 'c' + index,
        header: <InlineView nodes={header} />,
        headerText: inlineText(header),
        cell: (row) => <InlineView nodes={row.cells[index] || []} />,
        sortValue: (row) => row.sort[index],
        width: Math.round(Math.min(520, Math.max(110, average * 7.5))),
        align: block.align[index],
      };
    });
    return { rows, columns };
  }, [block]);
  return (
    <DataTable
      rows={rows}
      columns={columns}
      storageKey={storageKey}
      getRowId={(row) => row.id}
      fitWidth
      wrap
      stickyHeader={false}
      caption={columns.map((c) => c.headerText).join(', ')}
      className="my-3"
    />
  );
}

function ListView({ block, storageKey }: { block: Extract<Block, { type: 'list' }>; storageKey: string }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  const tasks = block.items.some((item) => item.checked !== undefined);
  return (
    <Tag
      start={block.ordered && block.start !== 1 ? block.start : undefined}
      className={cn(
        'my-2 space-y-1.5 text-sm leading-relaxed text-ink-secondary dark:text-slate-300',
        tasks ? 'list-none pl-0' : block.ordered ? 'list-decimal pl-6' : 'list-disc pl-5',
        'marker:text-ink-muted dark:marker:text-slate-500',
      )}
    >
      {block.items.map((item, index) => {
        const [first, ...rest] = item.blocks;
        const lead = first?.type === 'paragraph' ? <InlineView nodes={first.inlines} /> : null;
        const children = lead ? rest : item.blocks;
        const body = (
          <>
            {lead}
            {children.length > 0 && <BlocksView blocks={children} storageKey={storageKey + '-' + index} />}
          </>
        );
        return (
          <li key={index} className={cn('pl-1', tasks && 'flex items-start gap-2 pl-0')}>
            {item.checked !== undefined &&
              (item.checked ? (
                <SquareCheck
                  size={16}
                  aria-label="Đã xong"
                  className="mt-0.5 shrink-0 text-success-600 dark:text-success-400"
                />
              ) : (
                <Square
                  size={16}
                  aria-label="Chưa đánh dấu"
                  className="mt-0.5 shrink-0 text-ink-muted dark:text-slate-500"
                />
              ))}
            {tasks ? <div className="min-w-0 flex-1">{body}</div> : body}
          </li>
        );
      })}
    </Tag>
  );
}

function BlocksView({ blocks, storageKey }: { blocks: Block[]; storageKey: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = storageKey + '-' + index;
        switch (block.type) {
          case 'heading':
            return <HeadingView key={index} block={block} />;
          case 'paragraph':
            return (
              <p key={index} className="my-2 text-sm leading-relaxed text-ink-secondary dark:text-slate-300">
                <InlineView nodes={block.inlines} />
              </p>
            );
          case 'list':
            return <ListView key={index} block={block} storageKey={key} />;
          case 'table':
            return <TableView key={index} block={block} storageKey={key} />;
          case 'code':
            return (
              <figure key={index} className="my-3">
                {block.lang === 'mermaid' && (
                  <figcaption className="mb-1 text-xs text-ink-muted dark:text-slate-400">
                    Sơ đồ dạng văn bản: mỗi dòng “A --&gt; B” là một bước chuyển từ A sang B.
                  </figcaption>
                )}
                <pre className="overflow-x-auto rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-950 p-3 font-mono text-xs leading-relaxed text-ink dark:text-slate-200">
                  <code>{block.text}</code>
                </pre>
              </figure>
            );
          case 'quote':
            return (
              <blockquote
                key={index}
                className="my-3 rounded-r-xl border-l-4 border-primary-400 dark:border-primary-500 bg-primary-50 dark:bg-slate-800 px-4 py-2"
              >
                <BlocksView blocks={block.blocks} storageKey={key} />
              </blockquote>
            );
          case 'rule':
            return <hr key={index} className="my-4 border-border dark:border-slate-800" />;
          default:
            return null;
        }
      })}
    </>
  );
}

function ShortcutsCard() {
  return (
    <Card padding="md" className="rounded-2xl">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink dark:text-slate-100">
        <Keyboard size={16} className="text-primary-600 dark:text-primary-300" aria-hidden="true" />
        Phím tắt
      </h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-start gap-3">
            <dt className="flex w-36 shrink-0 flex-wrap gap-1">
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded-md border border-border dark:border-slate-600 bg-subtle dark:bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-semibold text-ink dark:text-slate-100 shadow-sm"
                >
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className="min-w-0 text-ink-secondary dark:text-slate-300">{s.label}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function TocView({
  sections,
  active,
  onGo,
}: {
  sections: VisibleSection[];
  active: string;
  onGo: (id: string) => void;
}) {
  const item = (id: string, label: string, sub: boolean) => (
    <li key={id}>
      <a
        href={'#' + encodeURIComponent(id)}
        aria-current={active === id ? 'location' : undefined}
        onClick={(event) => {
          event.preventDefault();
          onGo(id);
        }}
        className={cn(
          'block rounded-lg px-2 py-1 leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          sub ? 'pl-5 text-xs' : 'text-sm font-medium',
          active === id
            ? 'bg-primary-50 dark:bg-slate-800 text-primary-700 dark:text-primary-200'
            : 'text-ink-secondary dark:text-slate-300 hover:bg-subtle dark:hover:bg-slate-800 hover:text-ink dark:hover:text-slate-100',
        )}
      >
        {label}
      </a>
    </li>
  );
  return (
    <nav aria-label="Mục lục hướng dẫn">
      <p className="mb-2 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">
        <ListTree size={14} aria-hidden="true" />
        Mục lục
      </p>
      <ul className="space-y-0.5">
        {sections
          .filter((v) => v.section.heading && v.section.id !== DOC_TOC_ID)
          .flatMap((v) => [
            item(v.section.id, v.section.title, false),
            ...v.subsections.map((s) => item(s.id, s.title, true)),
          ])}
      </ul>
    </nav>
  );
}

/** Hướng dẫn sử dụng: tài liệu docs/HUONG_DAN_QUY_TRINH_THAM_DINH_AI.md hiển thị trong ứng dụng. */
export function HelpPage() {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const visible = useMemo(() => filterSections(deferred), [deferred]);
  const [active, setActive] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const searching = !!deferred.trim();

  const scrollTo = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return false;
    // Scroll only the app's content area: scrollIntoView would also shift the overflow-hidden app frame.
    const scroller = document.getElementById('main-content');
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (scroller) {
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16;
      scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    } else target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    target.focus({ preventScroll: true });
    setActive(id);
    try {
      window.history.replaceState(window.history.state, '', '#' + encodeURIComponent(id));
    } catch {
      // the address bar keeps the previous hash
    }
    return true;
  }, []);

  // A section hidden by the search is shown again (search cleared) before scrolling to it.
  const goTo = useCallback(
    (id: string) => {
      if (scrollTo(id)) return;
      setQuery('');
      setPending(id);
    },
    [scrollTo],
  );

  useEffect(() => {
    if (pending && !searching && scrollTo(pending)) setPending(null);
  }, [pending, searching, visible, scrollTo]);

  // Deep link: /help#56-đọc-thanh-tiến-trình-hồ-sơ
  useEffect(() => {
    const hash = safeDecode(window.location.hash.slice(1));
    if (hash) window.requestAnimationFrame(() => scrollTo(hash));
  }, [scrollTo]);

  // Highlight the table-of-contents entry of the heading at the top of the scroll area.
  useEffect(() => {
    const scroller = document.getElementById('main-content');
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top + 96;
      const headings = articleRef.current?.querySelectorAll<HTMLElement>('[data-help-heading]') || [];
      let current = '';
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= top) current = heading.id;
        else break;
      }
      setActive(current || headings[0]?.id || '');
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [visible]);

  // Keep the highlighted entry visible inside the sticky table of contents (without moving the page).
  useEffect(() => {
    const box = tocRef.current;
    const link = box?.querySelector<HTMLElement>('[aria-current]');
    if (!box || !link) return;
    const outer = box.getBoundingClientRect();
    const inner = link.getBoundingClientRect();
    if (inner.top < outer.top + 8 || inner.bottom > outer.bottom - 8)
      box.scrollTop += inner.top - outer.top - box.clientHeight / 3;
  }, [active]);

  const count = visible.filter((v) => v.section.heading && v.section.id !== DOC_TOC_ID).length;

  return (
    <GoToContext.Provider value={goTo}>
      <div className="mx-auto max-w-7xl space-y-5 text-ink dark:text-slate-100">
        <PageHeader
          title="Hướng dẫn sử dụng"
          description="Quy trình thẩm định hồ sơ có hỗ trợ AI: các bước thao tác, cách đọc kết quả và xử lý tình huống thường gặp."
          icon={<LifeBuoy size={22} aria-hidden="true" />}
        />

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-3">
          <GridSearchInput
            value={query}
            onChange={setQuery}
            label="Tìm trong hướng dẫn"
            placeholder="Tìm trong hướng dẫn, ví dụ: ocr, tong muc dau tu, gpxd…"
            className="flex-1 sm:w-full sm:max-w-xl"
          />
          <GridCount total={count} unit="mục" detail={searching ? 'khớp từ khóa' : undefined} />
        </div>

        <ShortcutsCard />

        <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <div
              ref={tocRef}
              className="sticky top-0 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-3 shadow-card"
            >
              <TocView sections={visible} active={active} onGo={goTo} />
            </div>
          </aside>

          <div ref={articleRef} className="min-w-0 select-text">
            {!visible.length ? (
              <Card padding="lg" className="rounded-2xl">
                <EmptyState
                  variant="search"
                  title="Không tìm thấy nội dung phù hợp"
                  description="Thử từ khóa khác. Có thể gõ không dấu hoặc viết tắt như gpxd, bcnckt, tmdt."
                  action={{ label: 'Xóa từ khóa', onClick: () => setQuery('') }}
                />
              </Card>
            ) : (
              <article className="space-y-4">
                {visible.map(({ section, showIntro, subsections }) => (
                  <Card
                    key={section.id}
                    padding="lg"
                    className={cn('rounded-2xl', section.id === DOC_TOC_ID && 'xl:hidden')}
                  >
                    <section aria-labelledby={section.heading?.id}>
                      {section.heading && <HeadingView block={section.heading} />}
                      {showIntro && <BlocksView blocks={section.intro} storageKey={'help-' + section.id} />}
                      {subsections.map((sub) => (
                        <section key={sub.id} aria-labelledby={sub.id}>
                          <HeadingView block={sub.heading} />
                          <BlocksView blocks={sub.blocks} storageKey={'help-' + sub.id} />
                        </section>
                      ))}
                    </section>
                  </Card>
                ))}
              </article>
            )}
          </div>
        </div>
      </div>
    </GoToContext.Provider>
  );
}

export default HelpPage;
