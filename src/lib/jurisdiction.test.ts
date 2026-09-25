import { describe, expect, it } from 'vitest';
import { determineJurisdiction } from './jurisdiction';

describe('xác định thẩm quyền (Điều 32 NĐ 217/2026)', () => {
  const base = { procedureType: 'tham_dinh_bcnckt', projectGroup: 'B', buildingGrade: 'II', investmentForm: 'dau_tu_cong' } as const;

  it('dự án đầu tư công → Sở Xây dựng', () => {
    expect(determineJurisdiction(base).authority).toBe('so_xay_dung');
  });
  it('dự án PPP → Sở Xây dựng', () => {
    expect(determineJurisdiction({ ...base, investmentForm: 'ppp' }).isSoXayDung).toBe(true);
  });
  it('dự án do UBND cấp xã quyết định đầu tư → cấp xã', () => {
    expect(determineJurisdiction({ ...base, decidedByCommune: true }).authority).toBe('ubnd_cap_xa');
  });
  it('công trình cấp đặc biệt → Bộ chuyên ngành', () => {
    expect(determineJurisdiction({ ...base, buildingGrade: 'DB' }).authority).toBe('bo_chuyen_nganh');
  });
  it('dự án quan trọng quốc gia → Hội đồng thẩm định NN', () => {
    expect(determineJurisdiction({ ...base, projectGroup: 'QG' }).authority).toBe('hoi_dong_tham_dinh_nn');
  });
  it('dự án kinh doanh: chỉ Phụ lục IV thuộc Sở', () => {
    expect(determineJurisdiction({ ...base, investmentForm: 'kinh_doanh' }).isSoXayDung).toBe(false);
    expect(determineJurisdiction({ ...base, investmentForm: 'kinh_doanh', isAppendixIV: true }).isSoXayDung).toBe(true);
  });
  it('cấp GPXD: cấp I, II thuộc Sở; cấp III và nhà ở riêng lẻ thuộc xã', () => {
    const gpxd = { ...base, procedureType: 'cap_gpxd' } as const;
    expect(determineJurisdiction({ ...gpxd, buildingGrade: 'I' }).isSoXayDung).toBe(true);
    expect(determineJurisdiction({ ...gpxd, buildingGrade: 'III' }).authority).toBe('ubnd_cap_xa');
    expect(determineJurisdiction({ ...gpxd, isDetachedHouse: true }).authority).toBe('ubnd_cap_xa');
  });
});
