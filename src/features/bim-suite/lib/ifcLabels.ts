// features/bim/lib/ifcLabels.ts
// Bảng dịch các lớp cấu kiện IFC sang Tiếng Việt (TCVN & IFC 4.3 Hạ tầng giao thông)

export const ifcLabels: Record<string, string> = {
  // Cấu kiện kết cấu chính
  IFCWALL: 'Tường',
  IFCWALLSTANDARDCASE: 'Tường tiêu chuẩn',
  IFCCURTAINWALL: 'Tường kính / Vách kính',
  IFCCOLUMN: 'Cột / Trụ',
  IFCBEAM: 'Dầm',
  IFCSLAB: 'Sàn / Bản mặt cầu',
  IFCFOOTING: 'Móng / Bệ mố trụ',
  IFCPILE: 'Cọc bê tông / Cọc khoan nhồi',
  IFCSTAIR: 'Cầu thang',
  IFCSTAIRFLIGHT: 'Vế thang',
  IFCRAILING: 'Lan can / Hàng rào bảo vệ',
  IFCROOF: 'Mái',
  IFCMEMBER: 'Thanh giằng / Bản thép kết cấu',
  IFCPLATE: 'Tấm thép / Bản thép',

  // Cấu kiện đặc thù Đường sắt & Giao thông (IFC 4.3)
  IFCRAILWAY: 'Tuyến đường sắt',
  IFCTRACK: 'Đường ray',
  IFCRAIL: 'Ray thép',
  IFCSLEEPER: 'Tà vẹt (Bê tông / Gỗ)',
  IFCFASTENER: 'Phụ kiện liên kết ray (Cóc, đinh ốc)',
  IFCSWITCH: 'Ghi đường sắt (Bộ chuyển ray)',
  IFCBALLAST: 'Lớp đá ba-lát (Đá dăm nền đường ray)',
  IFCROAD: 'Tuyến đường bộ kết nối',
  IFCBRIDGE: 'Công trình Cầu',
  IFCBRIDGECONTENT: 'Hạng mục Cầu',
  IFCBRIDGEPART: 'Phân đoạn Cầu (Mố, Trụ, Nhịp)',
  IFCTUNNEL: 'Công trình Hầm',
  IFCTUNNELPART: 'Đoạn Hầm / Vỏ hầm',
  IFCALIGNMENT: 'Tim tuyến thiết kế',
  IFCSIGNAL: 'Cột tín hiệu đường sắt',
  IFCSIGNALBOX: 'Hộp tín hiệu / Tủ điều khiển ga',

  // Cửa & Hoàn thiện
  IFCDOOR: 'Cửa đi',
  IFCWINDOW: 'Cửa sổ',
  IFCCOVERING: 'Lớp trát / Sơn / Ốp lát',
  IFCFURNISHINGELEMENT: 'Trang thiết bị / Nội thất',

  // Hệ thống MEP & Thông tin tín hiệu
  IFCDUCTSEGMENT: 'Đoạn ống gió',
  IFCDUCTFITTING: 'Cút / Tê ống gió',
  IFCPIPESEGMENT: 'Đoạn ống cấp thoát nước',
  IFCPIPEFITTING: 'Cút / Tê / Co nối ống',
  IFCVALVE: 'Van đường ống',
  IFCPUMP: 'Máy bơm',
  IFCFAN: 'Quạt thông gió hầm / nhà ga',
  IFCFLOWTERMINAL: 'Miệng gió / Thiết bị đầu cuối',
  IFCCABLECARRIERSEGMENT: 'Thang máng cáp điện / cáp tín hiệu',
  IFCCABLESEGMENT: 'Dây cáp điện / Cáp thông tin',
  IFCLIGHTFIXTURE: 'Đèn chiếu sáng',
  IFCSWITCHINGDEVICE: 'Cầu dao / Công tắc',
  IFCDISTRIBUTIONBOARD: 'Tủ điện / Tủ phân phối',
  IFCELECTRICDISTRIBUTIONBOARD: 'Tủ phân phối điện',
  IFCCHILLER: 'Máy làm lạnh Chiller',
  IFCUNITARYEQUIPMENT: 'Bộ xử lý không khí AHU',
  IFCTANK: 'Bồn chứa nước',
  IFCAIRTERMINAL: 'Miệng gió',
  IFCFIRESUPPRESSIONTERMINAL: 'Đầu phun chữa cháy',
  IFCELECTRICMOTOR: 'Động cơ điện',
  IFCTRANSFORMER: 'Máy biến áp trạm điện',

  // Địa hình & Hạ tầng
  IFCSITE: 'Khu đất / Hiện trường dự án',
  IFCBUILDING: 'Công trình / Nhà ga',
  IFCBUILDINGSTOREY: 'Cao trình / Tầng / Phân đoạn',
  IFCSPACE: 'Không gian / Phòng / Khoang',
  IFCGEOGRAPHICELEMENT: 'Địa hình / Khảo sát hiện trạng',
  IFCEARTHWORKS: 'Công tác đào đắp nền đường',

  // Khác
  IFCELEMENTASSEMBLY: 'Cụm tổ hợp cấu kiện',
  IFCBUILDINGELEMENTPROXY: 'Cấu kiện đúc sẵn / Cấu kiện khác',
  IFCOPENINGELEMENT: 'Lỗ mở kỹ thuật',
};

export const getIfcLabel = (category: string): string => {
  if (!category) return 'Cấu kiện';
  const clean = category.toUpperCase().replace(/\s+/g, '');
  return ifcLabels[clean] || category;
};

export const disciplineLabels: Record<string, string> = {
  TOAN_THE: 'Toàn thể công trình',
  CAU: 'Công trình Cầu',
  HAM: 'Công trình Hầm',
  NHA_GA: 'Nhà ga & Quảng trường',
  DUONG_RAY: 'Tuyến ray & Nền đường',
  KIEN_TRUC: 'Kiến trúc',
  KET_CAU: 'Kết cấu',
  MEP: 'Cơ điện (MEP)',
  THONG_TIN_TIN_HIEU: 'Thông tin & Tín hiệu',
  DIEN: 'Điện',
  CAP_THOAT_NUOC: 'Cấp thoát nước',
  PCCC: 'Phòng cháy chữa cháy',
  HA_TANG: 'Hạ tầng kỹ thuật',
  KHAC: 'Bộ môn khác',
};
