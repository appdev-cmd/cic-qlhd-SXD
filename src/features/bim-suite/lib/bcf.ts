// features/bim/lib/bcf.ts
// Xuất / nhập vướng mắc theo chuẩn openBIM BCF 2.1 (BIM Collaboration Format)
// Tương thích Revit (BCF Manager), Navisworks, BIMcollab, Solibri, Trimble Connect.
//
// BCF 2.1 không có phần tử cho phép đo và trạng thái bảng mặt cắt. Hai thứ này đi trong tệp mở rộng riêng
// `buildsia-extensions.json` trong thư mục của từng chủ đề (cạnh markup.bcf). Phần mềm khác bỏ qua tệp lạ trong
// .bcfzip; nhập lại vào BuildSIA thì khôi phục đủ phép đo, mặt cắt và camera chính xác. Tệp của cic-hud
// (`hud-extensions.json`, cùng cấu trúc) vẫn đọc được.

import type {
  BimClipPlaneState,
  BimIssue,
  BimIssueComment,
  BimMeasurementRecord,
  BimViewpoint,
  BimViewpointSection,
} from '@/features/bim-suite/types/bim.types';
import { sanitizeMeasurements } from './measureRecords';
import { normalizeSectionState } from './sectionState';

// Fragments/Three.js dùng Y hướng lên; IFC/BCF dùng Z hướng lên.
// three(x, y, z) = ifc(x, z, -y)  ⇔  ifc(x, y, z) = three(x, -z, y)
const toIfc = ([x, y, z]: [number, number, number]): [number, number, number] => [x, -z, y];
const fromIfc = ([x, y, z]: [number, number, number]): [number, number, number] => [x, z, -y];

const STATUS_TO_BCF: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
const BCF_TO_STATUS: Record<string, BimIssue['status']> = {
  open: 'open',
  'in progress': 'in_progress',
  active: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
};
const PRIORITY_TO_BCF: Record<string, string> = { low: 'Low', normal: 'Normal', high: 'High', critical: 'Critical' };
const TYPE_TO_BCF: Record<string, string> = {
  thiet_ke: 'Design',
  va_cham: 'Clash',
  hien_truong: 'Issue',
  giai_phong_mat_bang: 'Request',
};
const BCF_TO_TYPE: Record<string, BimIssue['issue_type']> = {
  design: 'thiet_ke',
  clash: 'va_cham',
  issue: 'hien_truong',
  request: 'giai_phong_mat_bang',
};

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const vec = (tag: string, [x, y, z]: [number, number, number]) => `<${tag}><X>${x}</X><Y>${y}</Y><Z>${z}</Z></${tag}>`;

/** Tên tệp mở rộng trong mỗi thư mục chủ đề */
export const HUD_BCF_EXTENSION_FILE = 'buildsia-extensions.json';
export const HUD_BCF_EXTENSION_FORMAT = 'buildsia.bcf-extension';
const LEGACY_EXTENSION_FILE = 'hud-extensions.json';
const LEGACY_EXTENSION_FORMAT = 'cic-hud.bcf-extension';

export interface HudBcfExtension {
  format: typeof HUD_BCF_EXTENSION_FORMAT;
  version: 1;
  /** Guid của viewpoint.bcfv mà phần mở rộng đi kèm */
  viewpointGuid: string;
  /** Toạ độ thế giới của trình xem (Y hướng lên, mét) — giữ nguyên để khôi phục đúng camera */
  camera: BimViewpoint['camera'] | null;
  measurements: BimMeasurementRecord[];
  section: BimViewpointSection | null;
  sectionPlanes: BimClipPlaneState[];
}

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Phần mở rộng của một góc nhìn; null nếu không có gì ngoài chuẩn BCF cần lưu */
export const buildHudExtension = (
  viewpoint: BimViewpoint | null | undefined,
  viewpointGuid: string,
): HudBcfExtension | null => {
  if (!viewpoint) return null;
  const measurements = sanitizeMeasurements(viewpoint.measurements);
  const section = viewpoint.section ?? null;
  const sectionPlanes = (viewpoint.sectionPlanes || []).filter((p) => isVec3(p.normal) && Number.isFinite(p.constant));
  if (!measurements.length && !section && !sectionPlanes.length) return null;
  return {
    format: HUD_BCF_EXTENSION_FORMAT,
    version: 1,
    viewpointGuid,
    camera: viewpoint.camera ?? null,
    measurements,
    section,
    sectionPlanes,
  };
};

/** Đọc phần mở rộng; bỏ qua tệp hỏng hoặc không phải của BuildSIA / cic-hud */
export const parseHudExtension = (
  raw: string,
):
  | (Pick<BimViewpoint, 'measurements' | 'section' | 'sectionPlanes'> & { camera: BimViewpoint['camera'] | null })
  | null => {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !data ||
    typeof data !== 'object' ||
    (data.format !== HUD_BCF_EXTENSION_FORMAT && data.format !== LEGACY_EXTENSION_FORMAT)
  )
    return null;
  const cam = data.camera;
  const camera =
    cam && isVec3(cam.position) && isVec3(cam.target)
      ? {
          position: cam.position,
          target: cam.target,
          ...(typeof cam.fov === 'number' && Number.isFinite(cam.fov) ? { fov: cam.fov } : {}),
        }
      : null;
  const sectionPlanes: BimClipPlaneState[] = Array.isArray(data.sectionPlanes)
    ? data.sectionPlanes
        .filter((p: any) => p && isVec3(p.normal) && typeof p.constant === 'number' && Number.isFinite(p.constant))
        .map((p: any) => ({ normal: p.normal, constant: p.constant }))
    : [];
  return {
    camera,
    measurements: sanitizeMeasurements(data.measurements),
    section: data.section && typeof data.section === 'object' ? normalizeSectionState(data.section, null) : null,
    sectionPlanes,
  };
};

/** Ghép phần mở rộng vào góc nhìn đọc từ viewpoint.bcfv (camera/mặt phẳng của phần mở rộng chính xác hơn) */
const mergeHudExtension = (
  viewpoint: BimViewpoint | null,
  ext: NonNullable<ReturnType<typeof parseHudExtension>>,
): BimViewpoint | null => {
  const camera = ext.camera ?? viewpoint?.camera;
  if (!camera) return viewpoint;
  return {
    ...(viewpoint ?? {}),
    camera,
    sectionPlanes: ext.sectionPlanes?.length ? ext.sectionPlanes : (viewpoint?.sectionPlanes ?? []),
    ...(ext.measurements?.length ? { measurements: ext.measurements } : {}),
    ...(ext.section ? { section: ext.section } : {}),
  };
};

const viewpointXml = (guid: string, issue: BimIssue): string => {
  const vp = issue.viewpoint;
  const selection = issue.target_element_guid
    ? `<Selection><Component IfcGuid="${esc(issue.target_element_guid)}" /></Selection>`
    : '';
  let camera = '';
  if (vp?.camera) {
    const pos = toIfc(vp.camera.position);
    const target = toIfc(vp.camera.target);
    const dir = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    camera = `<PerspectiveCamera>${vec('CameraViewPoint', pos)}${vec('CameraDirection', [dir[0] / len, dir[1] / len, dir[2] / len])}${vec('CameraUpVector', [0, 0, 1])}<FieldOfView>${vp.camera.fov ?? 60}</FieldOfView></PerspectiveCamera>`;
  }
  const planes = (vp?.sectionPlanes || [])
    .map((p) => {
      const n = toIfc(p.normal);
      // Điểm trên mặt phẳng: -constant * normal; BCF: pháp tuyến hướng về phía bị cắt bỏ
      const pt = toIfc([-p.constant * p.normal[0], -p.constant * p.normal[1], -p.constant * p.normal[2]]);
      return `<ClippingPlane>${vec('Location', pt)}${vec('Direction', [-n[0], -n[1], -n[2]])}</ClippingPlane>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${guid}"><Components>${selection}<Visibility DefaultVisibility="true" /></Components>${camera}${planes ? `<ClippingPlanes>${planes}</ClippingPlanes>` : ''}</VisualizationInfo>`;
};

const markupXml = (
  issue: BimIssue,
  comments: BimIssueComment[],
  viewpointGuid: string,
  hasSnapshot: boolean,
): string => {
  const topicGuid = isUuid(issue.id) ? issue.id : uuid();
  const commentXml = comments
    .filter((c) => c.loai !== 'he_thong')
    .map(
      (c) =>
        `<Comment Guid="${isUuid(c.id) ? c.id : uuid()}"><Date>${esc(c.created_at)}</Date><Author>${esc(c.author || 'BuildSIA')}</Author><Comment>${esc(c.body)}</Comment></Comment>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup>
<Topic Guid="${topicGuid}" TopicType="${esc(TYPE_TO_BCF[issue.issue_type] || 'Issue')}" TopicStatus="${esc(STATUS_TO_BCF[issue.status] || 'Open')}">
<Title>${esc(issue.title)}</Title>
<Priority>${esc(PRIORITY_TO_BCF[issue.priority] || 'Normal')}</Priority>
<CreationDate>${esc(issue.created_at)}</CreationDate>
<CreationAuthor>${esc(issue.created_by_name || 'BuildSIA')}</CreationAuthor>
${issue.updated_at ? `<ModifiedDate>${esc(issue.updated_at)}</ModifiedDate>` : ''}
${issue.due_date ? `<DueDate>${esc(issue.due_date)}T00:00:00</DueDate>` : ''}
${issue.assigned_to_name || issue.assigned_to ? `<AssignedTo>${esc(issue.assigned_to_name || issue.assigned_to)}</AssignedTo>` : ''}
${issue.description ? `<Description>${esc(issue.description)}</Description>` : ''}
</Topic>
${commentXml}
<Viewpoints Guid="${viewpointGuid}"><Viewpoint>viewpoint.bcfv</Viewpoint>${hasSnapshot ? '<Snapshot>snapshot.png</Snapshot>' : ''}</Viewpoints>
</Markup>`;
};

export const exportIssuesToBcf = async (
  items: { issue: BimIssue; comments: BimIssueComment[] }[],
  projectName: string,
  /** Đổi đường dẫn file trong kho (private) thành URL tải được */
  resolveFileUrl?: (pathOrUrl: string) => Promise<string | null>,
): Promise<Blob> => {
  const zip = await buildBcfZip(items, projectName, resolveFileUrl);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
};

/** Dựng gói .bcfzip (JSZip) — tách riêng để kiểm thử khứ hồi không cần Blob */
export const buildBcfZip = async (
  items: { issue: BimIssue; comments: BimIssueComment[] }[],
  projectName: string,
  resolveFileUrl?: (pathOrUrl: string) => Promise<string | null>,
) => {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file(
    'bcf.version',
    '<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1"><DetailedVersion>2.1</DetailedVersion></Version>',
  );
  zip.file(
    'project.bcfp',
    `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension><Project ProjectId="${uuid()}"><Name>${esc(projectName)}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>`,
  );

  for (const { issue, comments } of items) {
    const topicGuid = isUuid(issue.id) ? issue.id : uuid();
    const folder = zip.folder(topicGuid)!;
    const viewpointGuid = uuid();
    let hasSnapshot = false;
    const screenshotUrl = issue.screenshot_url
      ? resolveFileUrl
        ? await resolveFileUrl(issue.screenshot_url)
        : issue.screenshot_url
      : null;
    if (screenshotUrl) {
      try {
        const res = await fetch(screenshotUrl);
        if (res.ok) {
          folder.file('snapshot.png', await res.blob());
          hasSnapshot = true;
        }
      } catch {
        // ảnh không tải được → bỏ qua
      }
    }
    folder.file('markup.bcf', markupXml(issue, comments, viewpointGuid, hasSnapshot));
    folder.file('viewpoint.bcfv', viewpointXml(viewpointGuid, issue));
    const ext = buildHudExtension(issue.viewpoint, viewpointGuid);
    if (ext) folder.file(HUD_BCF_EXTENSION_FILE, JSON.stringify(ext, null, 2));
  }
  return zip;
};

export interface ImportedBcfTopic {
  title: string;
  description: string | null;
  status: BimIssue['status'];
  priority: BimIssue['priority'];
  issue_type: BimIssue['issue_type'];
  due_date: string | null;
  assigned_to_name: string | null;
  created_by_name: string | null;
  target_element_guid: string | null;
  viewpoint: BimViewpoint | null;
  snapshot: Blob | null;
  comments: { author: string; body: string; date: string }[];
}

const text = (el: Element | null | undefined, tag: string) =>
  el?.getElementsByTagName(tag)[0]?.textContent?.trim() || null;
const readVec = (el: Element | null | undefined, tag: string): [number, number, number] | null => {
  const node = el?.getElementsByTagName(tag)[0];
  if (!node) return null;
  const v = ['X', 'Y', 'Z'].map((k) => Number(text(node, k)));
  return v.every(Number.isFinite) ? (v as [number, number, number]) : null;
};

export const importIssuesFromBcf = async (file: Blob | ArrayBuffer | Uint8Array): Promise<ImportedBcfTopic[]> => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const parser = new DOMParser();
  const topics: ImportedBcfTopic[] = [];

  const markupPaths = Object.keys(zip.files).filter((p) => /(^|\/)markup\.bcf$/i.test(p));
  for (const path of markupPaths) {
    const dir = path.replace(/markup\.bcf$/i, '');
    const doc = parser.parseFromString(await zip.files[path].async('text'), 'application/xml');
    const topic = doc.getElementsByTagName('Topic')[0];
    if (!topic) continue;

    const vpRef = doc.getElementsByTagName('Viewpoints')[0];
    const vpFile = text(vpRef, 'Viewpoint') || 'viewpoint.bcfv';
    const snapFile = text(vpRef, 'Snapshot') || 'snapshot.png';

    let viewpoint: BimViewpoint | null = null;
    let targetGuid: string | null = null;
    const vpEntry = zip.files[dir + vpFile];
    if (vpEntry) {
      const vp = parser.parseFromString(await vpEntry.async('text'), 'application/xml');
      targetGuid =
        vp.getElementsByTagName('Selection')[0]?.getElementsByTagName('Component')[0]?.getAttribute('IfcGuid') || null;
      const cam = vp.getElementsByTagName('PerspectiveCamera')[0] || vp.getElementsByTagName('OrthogonalCamera')[0];
      const pos = readVec(cam, 'CameraViewPoint');
      const dir = readVec(cam, 'CameraDirection');
      if (pos && dir) {
        const target: [number, number, number] = [pos[0] + dir[0] * 10, pos[1] + dir[1] * 10, pos[2] + dir[2] * 10];
        viewpoint = {
          camera: {
            position: fromIfc(pos),
            target: fromIfc(target),
            fov: Number(text(cam, 'FieldOfView')) || undefined,
          },
          sectionPlanes: Array.from(vp.getElementsByTagName('ClippingPlane')).flatMap((cp) => {
            const loc = readVec(cp, 'Location');
            const d = readVec(cp, 'Direction');
            if (!loc || !d) return [];
            const n = fromIfc([-d[0], -d[1], -d[2]]);
            const p = fromIfc(loc);
            return [{ normal: n, constant: -(n[0] * p[0] + n[1] * p[1] + n[2] * p[2]) }];
          }),
        };
      }
    }

    // Phần mở rộng BuildSIA (hoặc cic-hud): phép đo, trạng thái bảng mặt cắt, camera chính xác
    const extEntry = zip.files[dir + HUD_BCF_EXTENSION_FILE] ?? zip.files[dir + LEGACY_EXTENSION_FILE];
    if (extEntry) {
      const ext = parseHudExtension(await extEntry.async('text'));
      if (ext) viewpoint = mergeHudExtension(viewpoint, ext);
    }

    const snapEntry = zip.files[dir + snapFile];
    const statusRaw = (topic.getAttribute('TopicStatus') || 'Open').toLowerCase();
    const priorityRaw = (text(topic, 'Priority') || 'normal').toLowerCase();
    const typeRaw = (topic.getAttribute('TopicType') || 'issue').toLowerCase();

    topics.push({
      title: text(topic, 'Title') || 'Vướng mắc nhập từ BCF',
      description: text(topic, 'Description'),
      status: BCF_TO_STATUS[statusRaw] || 'open',
      priority: (['low', 'normal', 'high', 'critical'].includes(priorityRaw)
        ? priorityRaw
        : 'normal') as BimIssue['priority'],
      issue_type: BCF_TO_TYPE[typeRaw] || 'hien_truong',
      due_date: text(topic, 'DueDate')?.slice(0, 10) || null,
      assigned_to_name: text(topic, 'AssignedTo'),
      created_by_name: text(topic, 'CreationAuthor'),
      target_element_guid: targetGuid,
      viewpoint,
      snapshot: snapEntry ? await snapEntry.async('blob') : null,
      comments: Array.from(doc.getElementsByTagName('Comment'))
        .filter((c) => c.parentElement?.tagName === 'Markup')
        .map((c) => ({ author: text(c, 'Author') || '', body: text(c, 'Comment') || '', date: text(c, 'Date') || '' }))
        .filter((c) => c.body),
    });
  }
  return topics;
};
