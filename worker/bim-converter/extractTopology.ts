// G8: trích mạng kết nối MEP từ IFC: cổng (IfcDistributionPort), cổng thuộc thiết bị (IfcRelNests ở IFC4,
// IfcRelConnectsPortToElement ở IFC2x3), nối cổng (IfcRelConnectsPorts) và hệ thống (IfcSystem, IfcDistributionSystem, IfcDistributionCircuit
// qua IfcRelAssignsToGroup). Chiều dòng lấy theo FlowDirection của hai cổng: SOURCE → SINK là xuôi; còn lại là hai chiều.
import * as WEBIFC from 'web-ifc';

export interface TopologyConnection {
  /** GlobalId cấu kiện phía cấp (thượng nguồn) */
  tu: string;
  /** GlobalId cấu kiện phía nhận (hạ nguồn) */
  den: string;
  chieu: 'xuoi' | 'hai_chieu';
}
export interface TopologySystem {
  guid: string;
  ten: string | null;
  loai: string;
  loai_he: string | null;
  thanh_vien: string[];
}
export interface TopologyResult {
  ports: number;
  connections: TopologyConnection[];
  systems: TopologySystem[];
  /** Nối cổng bỏ qua vì không tìm được cấu kiện chủ của một trong hai cổng */
  orphan: number;
}

const ids = (api: WEBIFC.IfcAPI, model: number, type: number): number[] => {
  const v = api.GetLineIDsWithType(model, type);
  return Array.from({ length: v.size() }, (_, i) => v.get(i));
};
const ref = (x: unknown): number | null =>
  x && typeof x === 'object' && 'value' in x ? Number((x as { value: unknown }).value) : null;
const text = (x: unknown): string | null => {
  const v = x && typeof x === 'object' && 'value' in x ? (x as { value: unknown }).value : x;
  return v === null || v === undefined || v === '' ? null : String(v);
};
const SYSTEM_TYPES = [
  WEBIFC.IFCSYSTEM,
  WEBIFC.IFCDISTRIBUTIONSYSTEM,
  WEBIFC.IFCDISTRIBUTIONCIRCUIT,
  WEBIFC.IFCBUILDINGSYSTEM,
].filter((t) => typeof t === 'number');

export function extractTopology(
  api: WEBIFC.IfcAPI,
  model: number,
  decode: (s: string) => string = (s) => s,
): TopologyResult {
  const guidOf = new Map<number, string>();
  const guid = (id: number) => {
    if (!guidOf.has(id)) guidOf.set(id, String(api.GetLine(model, id)?.GlobalId?.value ?? ''));
    return guidOf.get(id)!;
  };
  const portIds = ids(api, model, WEBIFC.IFCDISTRIBUTIONPORT);
  const flow = new Map<number, string>();
  for (const p of portIds)
    flow.set(p, String(api.GetLine(model, p)?.FlowDirection?.value ?? 'NOTDEFINED').toUpperCase());
  const portSet = new Set(portIds);

  // Cổng → cấu kiện chủ
  const owner = new Map<number, number>();
  for (const r of ids(api, model, WEBIFC.IFCRELNESTS)) {
    const line = api.GetLine(model, r);
    const host = ref(line.RelatingObject);
    if (host === null) continue;
    for (const o of line.RelatedObjects ?? []) {
      const p = ref(o);
      if (p !== null && portSet.has(p)) owner.set(p, host);
    }
  }
  if (typeof WEBIFC.IFCRELCONNECTSPORTTOELEMENT === 'number') {
    for (const r of ids(api, model, WEBIFC.IFCRELCONNECTSPORTTOELEMENT)) {
      const line = api.GetLine(model, r);
      const p = ref(line.RelatingPort),
        e = ref(line.RelatedElement);
      if (p !== null && e !== null && !owner.has(p)) owner.set(p, e);
    }
  }

  const connections: TopologyConnection[] = [];
  const seen = new Set<string>();
  let orphan = 0;
  for (const r of ids(api, model, WEBIFC.IFCRELCONNECTSPORTS)) {
    const line = api.GetLine(model, r);
    const a = ref(line.RelatingPort),
      b = ref(line.RelatedPort);
    if (a === null || b === null) continue;
    const ea = owner.get(a),
      eb = owner.get(b);
    if (ea === undefined || eb === undefined || ea === eb) {
      orphan++;
      continue;
    }
    const fa = flow.get(a),
      fb = flow.get(b);
    let c: TopologyConnection;
    if (fa === 'SOURCE' && fb !== 'SOURCE') c = { tu: guid(ea), den: guid(eb), chieu: 'xuoi' };
    else if (fb === 'SOURCE' && fa !== 'SOURCE') c = { tu: guid(eb), den: guid(ea), chieu: 'xuoi' };
    else if (fa === 'SINK' && fb !== 'SINK') c = { tu: guid(eb), den: guid(ea), chieu: 'xuoi' };
    else if (fb === 'SINK' && fa !== 'SINK') c = { tu: guid(ea), den: guid(eb), chieu: 'xuoi' };
    else c = { tu: guid(ea), den: guid(eb), chieu: 'hai_chieu' };
    const key = `${c.tu}>${c.den}>${c.chieu}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connections.push(c);
  }

  // Hệ thống và thành viên (chỉ cấu kiện, bỏ cổng)
  const systemIds = new Set(SYSTEM_TYPES.flatMap((t) => ids(api, model, t)));
  const members = new Map<number, Set<string>>();
  for (const r of ids(api, model, WEBIFC.IFCRELASSIGNSTOGROUP)) {
    const line = api.GetLine(model, r);
    const g = ref(line.RelatingGroup);
    if (g === null || !systemIds.has(g)) continue;
    const set = members.get(g) ?? new Set<string>();
    for (const o of line.RelatedObjects ?? []) {
      const e = ref(o);
      if (e !== null && !portSet.has(e)) set.add(guid(e));
    }
    members.set(g, set);
  }
  const systems: TopologySystem[] = [...systemIds].map((s) => {
    const line = api.GetLine(model, s);
    const name = text(line.Name);
    return {
      guid: String(line.GlobalId?.value ?? ''),
      ten: name ? decode(name) : null,
      loai: api.GetNameFromTypeCode(api.GetLineType(model, s)).toUpperCase(),
      loai_he: text(line.PredefinedType),
      thanh_vien: [...(members.get(s) ?? [])].sort(),
    };
  });
  return { ports: portIds.length, connections, systems, orphan };
}
