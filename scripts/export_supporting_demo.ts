import { mkdirSync, writeFileSync } from 'node:fs';
import { MOCK_ORGANIZATIONS, MOCK_PERSONNEL, MOCK_MATERIAL_PRICES } from '../src/data/mockData';
const common = { revision: 1, updated_at: '2026-09-28T00:00:00Z' };
const catalogs = {
  organizations: MOCK_ORGANIZATIONS.map((o) => ({
    ...common,
    id: o.id,
    code: o.code,
    name: o.name,
    type: o.type,
    tax_code: o.taxCode,
    address: o.address,
    legal_rep: o.representative,
    phone: o.phone,
    email: null,
    cert_number: o.certificateNumber,
    cert_grade: o.certificateGrade,
    cert_expiry: o.certificateExpiry,
    status: o.status,
  })),
  personnel: MOCK_PERSONNEL.map((p) => ({
    ...common,
    id: p.id,
    code: p.code,
    full_name: p.fullName,
    cert_number: p.certNumber,
    cert_authority: p.certIssuer,
    cert_grade: p.certGrade,
    cert_expiry: p.certExpiry,
    specialties: p.specialties,
    org_id: p.orgId,
    org_name: p.orgName,
    email: p.email,
    phone: p.phone,
    status: p.status,
  })),
  material_prices: MOCK_MATERIAL_PRICES.map((p) => ({
    ...common,
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    standard_price: p.standardPrice,
    market_price: p.marketPrice,
    region: p.region,
    period: p.period,
    supplier: p.supplier,
  })),
};
mkdirSync('ai/app/data', { recursive: true });
writeFileSync('ai/app/data/demo_catalog.json', JSON.stringify(catalogs, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(catalogs).map(([key, rows]) => [key, rows.length]))));
