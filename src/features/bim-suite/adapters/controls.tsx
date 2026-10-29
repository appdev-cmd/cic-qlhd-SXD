import React, {
  Children,
  cloneElement,
  isValidElement,
  forwardRef,
  useId,
  useMemo,
  useState,
  useRef,
  useEffect,
} from 'react';
import { Modal } from '@/components/ui/Modal';
import { saveBlob } from '@/features/bim/services';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { DateInput } from '@/components/ui/DateInput';
import { NumberInput } from '@/components/ui/NumberInput';
import { useFilterState } from '@/hooks/useFilterState';
import { useColumnResize } from '@/hooks/useColumnResize';
import { Tooltip } from '@/components/ui/Tooltip';

const propsOf = (node: React.ReactNode): any => (isValidElement(node) ? node.props : {});
const textOf = (node: React.ReactNode): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Children.toArray(propsOf(node).children).map(textOf).join(' ');
const flatten = (children: React.ReactNode): React.ReactElement<any>[] =>
  Children.toArray(children).flatMap((n) =>
    isValidElement(n)
      ? n.type === React.Fragment
        ? flatten(propsOf(n).children)
        : [n as React.ReactElement<any>]
      : [],
  );

/** Preserve source table cells and actions while adding scoped persisted sorting and resizing. */
export function BimTable({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const id = useId();
  const [sort, setSort] = useFilterState<{ column: number; desc: boolean } | null>('bim-suite-sort-' + id, null);
  const { widths, start, nudge } = useColumnResize('bim-suite-width-' + id);
  const parts = flatten(children);
  const head = parts.find((n) => n.type === 'thead');
  const headers = flatten(propsOf(flatten(propsOf(head).children)[0]).children);
  return (
    <table {...props}>
      {parts.map((part, index) => {
        if (part.type === 'thead')
          return cloneElement(
            part,
            { key: index },
            <tr>
              {headers.map((cell, i) => (
                <th
                  {...cell.props}
                  key={i}
                  style={{
                    ...cell.props.style,
                    width: widths[i] || cell.props.style?.width || 180,
                    position: 'relative',
                    paddingRight: 18,
                  }}
                  aria-sort={sort?.column === i ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                >
                  <span className="inline-flex items-center gap-2">
                    {cell.props.children}
                    <button
                      type="button"
                      aria-label={'Sắp xếp ' + textOf(cell)}
                      onClick={() => setSort((s) => ({ column: i, desc: s?.column === i ? !s.desc : false }))}
                    >
                      ↕
                    </button>
                  </span>
                  <span
                    role="separator"
                    aria-label={'Độ rộng cột ' + textOf(cell)}
                    aria-orientation="vertical"
                    tabIndex={0}
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                    onPointerDown={(e) => start(i, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                        e.preventDefault();
                        nudge(i, e.key === 'ArrowLeft' ? -16 : 16, e.currentTarget);
                      }
                    }}
                  />
                </th>
              ))}
            </tr>,
          );
        if (part.type === 'tbody') {
          let rows = flatten(part.props.children);
          if (sort)
            rows = [...rows].sort((a, b) => {
              const av = textOf(flatten(a.props.children)[sort.column]),
                bv = textOf(flatten(b.props.children)[sort.column]);
              const numeric = (s: string) => Number(s.replace(/\./g, '').replace(',', '.').trim());
              const an = numeric(av),
                bn = numeric(bv);
              const cmp =
                av && bv && Number.isFinite(an) && Number.isFinite(bn)
                  ? an - bn
                  : av.localeCompare(bv, 'vi', { numeric: true });
              return sort.desc ? -cmp : cmp;
            });
          return cloneElement(part, { key: index }, rows);
        }
        return cloneElement(part, { key: index });
      })}
    </table>
  );
}
export function BimSelect({
  children,
  value,
  onChange,
  className,
  disabled,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => {
    const collect = (nodes: React.ReactNode): { value: string; label: string }[] =>
      flatten(nodes).flatMap((n) =>
        n.type === 'option'
          ? [{ value: String(n.props.value ?? textOf(n)), label: textOf(n) }]
          : collect(n.props.children),
      );
    return collect(children);
  }, [children]);
  return (
    <SearchableSelect
      className={className}
      disabled={disabled}
      options={options}
      value={String(value ?? '')}
      onChange={(v) =>
        onChange?.({ target: { value: v }, currentTarget: { value: v } } as React.ChangeEvent<HTMLSelectElement>)
      }
      placeholder={props['aria-label'] || 'Chọn…'}
    />
  );
}
export const BimInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function BimInput(
  { type, onChange, value, ...props },
  ref,
) {
  const event = (v: string) =>
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as React.ChangeEvent<HTMLInputElement>);
  if (type === 'date')
    return (
      <DateInput className={props.className} value={String(value ?? '')} disabled={props.disabled} onChange={event} />
    );
  if (type === 'number' && /giá|tiền|chi phí|đơn giá/i.test(String(props['aria-label'] || props.placeholder || '')))
    return (
      <NumberInput
        className={props.className}
        value={String(value ?? '')}
        suffix="VNĐ"
        disabled={props.disabled}
        onChange={(n) => event(String(n))}
      />
    );
  return (
    <input
      {...props}
      ref={ref}
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : props.inputMode}
      value={value}
      onChange={onChange}
    />
  );
});

export function BimOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const form = useRef<HTMLDivElement>(null),
    initial = useRef('');
  const [dirty, setDirty] = useState(false);
  const snapshot = () =>
    JSON.stringify(
      [...(form.current?.querySelectorAll<HTMLInputElement>('input,textarea') || [])].map((e) => ({
        value: e.value,
        checked: e.checked,
      })),
    );
  useEffect(() => {
    initial.current = snapshot();
  }, []);
  return (
    <Modal heading="Công cụ BIM" size="full" onClose={onClose} dirty={dirty}>
      <div ref={form} onInputCapture={() => setDirty(snapshot() !== initial.current)}>
        {children}
      </div>
    </Modal>
  );
}
export function BimGuide({ children, className }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && (
        <Modal heading="Hướng dẫn chuẩn bị và xuất IFC" onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>
              Xuất IFC2x3 hoặc IFC4 từ Revit, Tekla, ArchiCAD. Giữ đúng hệ tọa độ chung, tên bộ môn và phiên bản của dự
              án.
            </p>
            <p>
              Bật Base Quantities (Qto), Property Sets, vật liệu, cấu trúc tầng và GlobalId ổn định giữa các lần xuất.
              Kiểm tra đơn vị mét, m², m³ trước khi tải lên.
            </p>
            <p>
              Nhập mô hình vào workspace, kiểm tra chất lượng dữ liệu và IDS; xác nhận khối lượng ước tính trước khi
              dùng cho thẩm định, chi phí hoặc nghiệm thu.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
export function BimDownload({ href, children, className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <button
      type="button"
      className={className}
      data-tooltip={props['aria-label']}
      onClick={async () => {
        if (!href) return;
        const r = await fetch(href);
        if (!r.ok) throw Error('Không tải được tài liệu');
        saveBlob(await r.blob(), href.split('/').pop() || 'bim-document');
      }}
    >
      {children}
    </button>
  );
}
