import { describe, expect, it } from 'vitest';
import { buildSearchFilters, matchesSmartSearch, removeVietnameseTones } from './smartSearch';

describe('tìm kiếm thông minh tiếng Việt', () => {
  it('bỏ dấu, kể cả chữ đ', () => {
    expect(removeVietnameseTones('Điện Biên Phủ')).toBe('dien bien phu');
  });

  it('gõ không dấu khớp văn bản có dấu', () => {
    expect(matchesSmartSearch('Bệnh viện Đa khoa Mường Ảng', 'muong ang')).toBe(true);
  });

  it('từ viết tắt + từ thường, không phụ thuộc thứ tự', () => {
    const name = 'Ban QLDA Các công trình Dân dụng & Công nghiệp tỉnh Điện Biên';
    expect(matchesSmartSearch(name, 'bqlda dan dung')).toBe(true);
    expect(matchesSmartSearch(name, 'dan dung bqlda')).toBe(true);
    expect(matchesSmartSearch(name, 'bqlda giao thong')).toBe(false);
  });

  it('viết tắt đầy đủ: ubnd, pccc', () => {
    expect(matchesSmartSearch('Ủy ban Nhân dân Thành phố Điện Biên Phủ', 'ubnd tp')).toBe(true);
    expect(matchesSmartSearch('Văn bản thẩm duyệt phòng cháy chữa cháy', 'pccc')).toBe(true);
  });

  it('sinh bộ lọc DB: mỗi từ một điều kiện OR', () => {
    expect(buildSearchFilters('bqlda dan dung')).toEqual([
      'search_text.ilike.*bqlda*,search_text.ilike.*ban quan ly du an*,search_text.ilike.*ban qlda*,search_text.ilike.*qlda*',
      'search_text.ilike.*dan*',
      'search_text.ilike.*dung*',
    ]);
    expect(buildSearchFilters('  ')).toEqual([]);
    expect(buildSearchFilters('a,b(c)')).toEqual(['search_text.ilike.*a*', 'search_text.ilike.*b*', 'search_text.ilike.*c*']);
  });
});
