// Provider-neutral declarations of the BIM viewer and Uniclass tools (port of cic-hud bimViewerTools /
// bimUniclassTools). Parameters are plain JSON Schema (lowercase types) so the server assistant of plan section 5
// can map them to any model provider. Descriptions stay in Vietnamese: the model reads them.
import { BIM_UNICLASS_TOOL_LIST, BIM_VIEWER_TOOL_LIST, type BimToolName } from './toolNames';

export type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';

export interface JsonSchema {
  type: JsonSchemaType;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

/**
 * viewer = changes the 3D view in the browser (undo checkpoint before each call);
 * read = reads viewer or model data only; draft = writes data, so the assistant prepares a draft the user confirms.
 */
export type BimToolKind = 'viewer' | 'read' | 'draft';

export interface BimToolDeclaration {
  name: BimToolName;
  description: string;
  parameters: JsonSchema & { type: 'object'; properties: Record<string, JsonSchema> };
  kind: BimToolKind;
}

const guids: JsonSchema = {
  type: 'array',
  items: { type: 'string' },
  description: 'Danh sách GlobalId (GUID 22 ký tự) của cấu kiện cụ thể nếu có',
};
const category = (description: string): JsonSchema => ({
  type: 'string',
  description: `${description}. Nhiều lớp IFC phân tách bằng dấu phẩy, VD "IFCCOLUMN,IFCBEAM".`,
});
const storey: JsonSchema = {
  type: 'string',
  description: 'Giới hạn trong một tầng của mô hình đang nạp, VD "3", "T03", "Tầng 3", "B1" (hầm 1)',
};
const empty = { type: 'object' as const, properties: {} };

export const BIM_VIEWER_TOOLS: BimToolDeclaration[] = [
  {
    name: 'viewer_isolate_elements',
    kind: 'viewer',
    description:
      'Cô lập (chỉ hiển thị) các cấu kiện trên mô hình 3D. Truyền loai_cau_kien (VD "IFCCOLUMN", "cột", "dầm") để cô lập toàn bộ loại đó, hoặc guids để cô lập đúng tập vừa tìm. Có thể giới hạn theo tầng.',
    parameters: {
      type: 'object',
      properties: {
        loai_cau_kien: category(
          'Lớp IFC hoặc tên tiếng Việt: IFCCOLUMN (cột), IFCBEAM (dầm), IFCSLAB (sàn), IFCWALL (tường), IFCDOOR (cửa), IFCFOOTING (móng)...',
        ),
        guids,
        tang: storey,
      },
    },
  },
  {
    name: 'viewer_xray_elements',
    kind: 'viewer',
    description:
      'Bật chế độ nhìn xuyên thấu X-Ray: làm mờ trong suốt toàn bộ công trình và tô sáng các cấu kiện được chỉ định. Có thể truyền trực tiếp loai_cau_kien (VD: "IFCCOLUMN", "cột", "dầm"...).',
    parameters: {
      type: 'object',
      properties: {
        loai_cau_kien: category('Lớp IFC hoặc tên tiếng Việt (cột, dầm, sàn...)'),
        guids,
        color: { type: 'string', description: 'Mã màu HEX cho cấu kiện nổi bật, VD #2563eb' },
        tang: storey,
      },
    },
  },
  {
    name: 'viewer_highlight_elements',
    kind: 'viewer',
    description:
      'Tô màu nổi bật các cấu kiện trên mô hình 3D. Hỗ trợ tô một loại cấu kiện, một danh sách GUID HOẶC nhiều loại cùng lúc với các màu khác nhau trong một lần gọi.',
    parameters: {
      type: 'object',
      properties: {
        loai_cau_kien: category('Lớp IFC hoặc tên tiếng Việt cấu kiện cần tô màu (khi chỉ tô 1 loại)'),
        guids,
        color: {
          type: 'string',
          description: 'Mã màu HEX (VD: đỏ #dc2626, xanh #2563eb, vàng #eab308, lục #16a34a, cam #ea580c, tím #7c3aed)',
        },
        tang: storey,
        danh_sach: {
          type: 'array',
          description:
            'Danh sách các nhóm cấu kiện cần tô màu đồng thời kèm màu sắc tương ứng. BẮT BUỘC DÙNG khi người dùng yêu cầu tô từ 2 loại cấu kiện trở lên với màu khác nhau (VD: cột đỏ, dầm xanh, sàn vàng).',
          items: {
            type: 'object',
            properties: {
              loai_cau_kien: category('Lớp IFC hoặc tên tiếng Việt (IFCCOLUMN, IFCBEAM, IFCSLAB...)'),
              color: { type: 'string', description: 'Mã màu HEX tương ứng (#dc2626, #2563eb, #eab308...)' },
              guids,
            },
            required: ['color'],
          },
        },
        accumulate: {
          type: 'boolean',
          description: 'true = cộng dồn màu với các màu đã tô trước đó, không xóa màu cũ. Mặc định true.',
        },
      },
    },
  },
  {
    name: 'viewer_hide_elements',
    kind: 'viewer',
    description: 'Ẩn các cấu kiện hoặc loại cấu kiện khỏi khung nhìn 3D.',
    parameters: {
      type: 'object',
      properties: { loai_cau_kien: category('Loại cấu kiện cần ẩn nếu có'), guids, tang: storey },
    },
  },
  {
    name: 'viewer_toggle_discipline',
    kind: 'viewer',
    description:
      'Hiển thị hoặc ẩn các bộ môn mô hình BIM trên khung nhìn 3D (Kiến trúc, Kết cấu, Cơ điện MEP). Dùng cho câu lệnh: "bật kiến trúc", "ẩn kiến trúc", "chỉ hiện kết cấu", "mở toàn bộ mô hình", "bật MEP".',
    parameters: {
      type: 'object',
      properties: {
        bo_mon: {
          type: 'string',
          description:
            'KIEN_TRUC_VA_KET_CAU (mọi mô hình Kiến trúc và Kết cấu sẵn sàng của dự án) | KIEN_TRUC | KET_CAU | MEP | TAT_CA',
        },
        hien_thi: {
          type: 'boolean',
          description: 'true = hiện bộ môn (mặc định true khi mở/hiển thị), false = ẩn bộ môn',
        },
        chi_hien_bo_mon_nay: {
          type: 'boolean',
          description: 'true nếu chỉ muốn xem riêng bộ môn này (ẩn tất cả các bộ môn khác)',
        },
      },
      required: ['bo_mon'],
    },
  },
  {
    name: 'viewer_show_all',
    kind: 'viewer',
    description: 'Hiện lại toàn bộ cấu kiện, bỏ cô lập, bỏ ẩn và xóa màu tô.',
    parameters: empty,
  },
  {
    name: 'viewer_fly_to_element',
    kind: 'viewer',
    description: 'Đưa camera bay tới và chọn một cấu kiện theo GUID.',
    parameters: {
      type: 'object',
      properties: { guid: { type: 'string', description: 'GlobalId của cấu kiện' } },
      required: ['guid'],
    },
  },
  {
    name: 'viewer_get_section_context',
    kind: 'read',
    description:
      'Đọc khung bao thực theo mét và danh sách tầng của các mô hình đang nạp. Dùng khi cần biết các tầng/tháp hoặc phạm vi cao độ. Không yêu cầu người dùng tự tính tỷ lệ cắt.',
    parameters: empty,
  },
  {
    name: 'viewer_set_section',
    kind: 'viewer',
    description:
      'Cắt mô hình bằng một mặt phẳng theo TÊN TẦNG hoặc CAO ĐỘ MÉT thực tế. Cắt tầng 24: tang="24", mặc định cao 1.5m trên sàn; có thể chỉ rõ toa_nha="Tháp A". Cắt cao độ 1.5m: cao_do_m=1.5. KHÔNG yêu cầu người dùng đổi tầng thành tỷ lệ. Trục y là cao độ. position chỉ dùng khi người dùng yêu cầu rõ tỷ lệ 0..1.',
    parameters: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'x | y | z (y = cao độ)' },
        tang: {
          type: 'string',
          description:
            'Tầng cần cắt: "24", "T24", "Tầng 24", "B1", hoặc tên tầng trong mô hình. Truyền thay cho position/cao_do_m.',
        },
        toa_nha: {
          type: 'string',
          description: 'Tên tháp/tòa nhà hoặc mô hình khi cần phân biệt, VD "Tháp A", "Tháp B".',
        },
        do_cao_tren_san_m: {
          type: 'number',
          description: 'Độ cao mặt cắt trên sàn tầng đã chọn, tính bằng mét; mặc định 1.5.',
        },
        cao_do_m: {
          type: 'number',
          description:
            'Cao độ tuyệt đối theo hệ tọa độ mô hình đang ghép, tính bằng mét. Không đồng nghĩa cao độ quốc gia hoặc độ cao trên sàn tầng đã chọn.',
        },
        position: { type: 'number', minimum: 0, maximum: 1, description: 'Vị trí cắt 0..1 (0.5 = giữa mô hình)' },
        flip: { type: 'boolean', description: 'Đảo phía giữ lại' },
        tat: { type: 'boolean', description: 'Đặt true để tắt mặt cắt' },
      },
    },
  },
  {
    name: 'viewer_set_section_box',
    kind: 'viewer',
    description:
      'Hộp cắt 3D bao quanh các cấu kiện (guids, ví dụ kết quả tìm kiếm) hoặc quanh một tầng (tang, toa_nha). Dùng cho "khoanh vùng", "cắt hộp quanh", "chỉ xem tầng 3 dạng hộp". tat=true để bỏ hộp cắt.',
    parameters: {
      type: 'object',
      properties: {
        guids,
        tang: { type: 'string', description: 'Tầng cần bao, VD "3", "T03", "B1"' },
        toa_nha: { type: 'string', description: 'Tháp/tòa nhà khi cần phân biệt' },
        le_m: { type: 'number', description: 'Lề quanh hộp, mét; mặc định 0.5' },
        tat: { type: 'boolean', description: 'true để tắt hộp cắt' },
      },
    },
  },
  {
    name: 'viewer_set_view',
    kind: 'viewer',
    description: 'Đặt hướng nhìn chuẩn cho camera.',
    parameters: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['iso', 'top', 'front', 'back', 'left', 'right', 'bottom'],
          description: 'iso (phối cảnh) | top (mặt bằng) | front | back | left | right | bottom',
        },
      },
      required: ['preset'],
    },
  },
  {
    name: 'viewer_measure_distance',
    kind: 'read',
    description:
      'Đo khoảng cách giữa hai cấu kiện theo khung bao thực (m): khoảng cách tâm, khoảng hở nhỏ nhất và chênh lệch theo trục. Bỏ trống GUID để đo hai cấu kiện đang chọn. Đây là số đo hình học của mô hình, không phải kích thước thiết kế.',
    parameters: {
      type: 'object',
      properties: {
        guid_a: { type: 'string', description: 'GUID cấu kiện thứ nhất' },
        guid_b: { type: 'string', description: 'GUID cấu kiện thứ hai' },
        model_id_a: { type: 'string', description: 'Mô hình của cấu kiện thứ nhất khi GUID trùng giữa các mô hình' },
        model_id_b: { type: 'string', description: 'Mô hình của cấu kiện thứ hai' },
      },
    },
  },
  {
    name: 'viewer_list_saved_views',
    kind: 'read',
    description: 'Liệt kê các góc nhìn đã lưu của dự án (tên, thời điểm).',
    parameters: empty,
  },
  {
    name: 'viewer_apply_view',
    kind: 'viewer',
    description: 'Áp một góc nhìn đã lưu theo tên (khớp gần đúng) hoặc id: camera, ẩn/cô lập theo mô hình, mặt cắt.',
    parameters: {
      type: 'object',
      properties: {
        ten: { type: 'string', description: 'Tên góc nhìn hoặc một phần tên' },
        id: { type: 'string', description: 'Mã góc nhìn từ viewer_list_saved_views' },
      },
    },
  },
  {
    name: 'viewer_save_view',
    kind: 'draft',
    description:
      'Chuẩn bị bản nháp lưu góc nhìn hiện tại (camera, ẩn/cô lập, mặt cắt). Người dùng xác nhận trước khi ghi.',
    parameters: {
      type: 'object',
      properties: {
        ten: { type: 'string', description: 'Tên góc nhìn' },
        mo_ta: { type: 'string', description: 'Mô tả ngắn' },
      },
      required: ['ten'],
    },
  },
  {
    name: 'viewer_show_clash_cluster',
    kind: 'viewer',
    description:
      'Hiển thị cụm va chạm thứ n: gom kết quả dò va chạm theo lưới (mặc định 1 m), cô lập các cấu kiện của cụm và đưa camera tới. Cụm được sắp theo số va chạm giảm dần; cum bắt đầu từ 1.',
    parameters: {
      type: 'object',
      properties: {
        cum: { type: 'integer', minimum: 1, description: 'Số thứ tự cụm, bắt đầu từ 1' },
        o_luoi_m: { type: 'number', description: 'Cạnh ô lưới gom cụm, mét; mặc định 1' },
      },
      required: ['cum'],
    },
  },
  {
    name: 'viewer_undo',
    kind: 'viewer',
    description: 'Hoàn tác thao tác khung nhìn gần nhất do trợ lý thực hiện (ẩn/hiện, màu, camera, mặt cắt).',
    parameters: empty,
  },
  {
    name: 'get_bim_uniclass',
    kind: 'read',
    description:
      'Tra cứu phân loại Uniclass 2015 (Pr sản phẩm, Ss hệ thống...) theo mã hoặc tên, đọc từ IfcClassificationReference của các mô hình đang nạp; thống kê số cấu kiện theo mã. Trả mã, tên trong tệp IFC và số lượng.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tên hoặc mã cần tìm; để trống để xem danh mục đang dùng' },
        pr: { type: 'string', description: 'Mã Pr, hỗ trợ mã cha và toàn bộ mã con' },
        ss: { type: 'string', description: 'Mã Ss, kết hợp AND với Pr' },
        tang: storey,
      },
    },
  },
  {
    name: 'viewer_filter_uniclass',
    kind: 'viewer',
    description:
      'Cô lập hoặc tô màu TẤT CẢ cấu kiện theo mã Uniclass Pr/Ss trên BIM. Gọi get_bim_uniclass để xác định mã từ tên trước. Không tìm thấy thì giữ nguyên khung nhìn.',
    parameters: {
      type: 'object',
      properties: {
        pr: { type: 'string', description: 'Mã Pr hoặc mã cha; unclassified để chọn đối tượng thiếu mã Pr' },
        ss: {
          type: 'string',
          description: 'Mã Ss hoặc mã cha; unclassified để chọn đối tượng thiếu mã Ss, kết hợp AND với Pr',
        },
        action: { type: 'string', enum: ['isolate', 'highlight'] },
        color: { type: 'string', description: 'Màu HEX khi highlight' },
        tang: storey,
      },
    },
  },
];

export const BIM_TOOL_REGISTRY: ReadonlyMap<string, BimToolDeclaration> = new Map(
  BIM_VIEWER_TOOLS.map((tool) => [tool.name, tool]),
);

export const bimToolKind = (name: string): BimToolKind | null => BIM_TOOL_REGISTRY.get(name)?.kind ?? null;

/** Names declared in toolNames.ts, for consistency checks. */
export const DECLARED_TOOL_NAMES: readonly string[] = [...BIM_VIEWER_TOOL_LIST, ...BIM_UNICLASS_TOOL_LIST];
