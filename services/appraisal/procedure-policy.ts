import data from './data/procedure_policy.json' with { type: 'json' };
export const VERSION = data.VERSION;
export interface StepRule {
  max?: number | null;
  waitDays?: number | null;
  waitDaysRenewal?: number;
  phase?: string;
  basis?: string;
  [key: string]: unknown;
}
export interface ProcedurePolicy {
  intakeDays: number | null;
  intakeDaysHouse?: number;
  intakeDaysRenewal?: number;
  intakeBasis?: string;
  supplement: StepRule;
  suspend?: StepRule | null;
  extend?: StepRule | null;
  restartBasis?: string;
  [key: string]: unknown;
}
export function policy(procedure = 'bcnckt'): ProcedurePolicy {
  return ((data.POLICY as unknown as Record<string, ProcedurePolicy>)[procedure] ||
    data.POLICY.bcnckt) as ProcedurePolicy;
}
export function intakeDays(procedure: string, subtype?: string | null) {
  const p = policy(procedure);
  if (procedure === 'gpxd' && subtype === 'house') return p.intakeDaysHouse;
  if (procedure === 'gpxd' && ['extension', 'reissue'].includes(subtype || '')) return p.intakeDaysRenewal;
  return p.intakeDays;
}
export function waitDays(procedure: string, kind: 'supplement' | 'suspend', subtype?: string | null) {
  const rule = policy(procedure)[kind] || {};
  return procedure === 'gpxd' && ['extension', 'reissue'].includes(subtype || '')
    ? rule.waitDaysRenewal
    : rule.waitDays;
}
