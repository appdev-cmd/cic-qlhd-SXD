// Chuyển đổi IFC -> Fragments (.frag) + trích xuất cấu kiện vào CSDL, chạy headless trong Node.

// 1. Giả lập biến toàn cục trình duyệt cho ThatOpen (phải chạy TRƯỚC khi import @thatopen/*)
if (typeof (globalThis as any).window === 'undefined') {
  const noop = () => ({});
  (globalThis as any).window = globalThis;
  (globalThis as any).self = globalThis;
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => ({
        fillStyle: '',
        fillRect: noop,
        drawImage: noop,
        getImageData: () => ({ data: [] }),
        putImageData: noop,
        createImageData: () => ({}),
      }),
      style: {},
      width: 100,
      height: 100,
    }),
    createElementNS: () => ({}),
    addEventListener: noop,
    removeEventListener: noop,
  };
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'node' },
      writable: true,
      configurable: true,
    });
  } catch {
    // ignore
  }
}

import JSZip from 'jszip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JobError } from './errors';
import { openIfcApi, webIfcWasmDir } from './ifcApi';
import { decodeIfcString, extractElements, ExtractedElement } from './extractElements';
import { extractTopology, type TopologyResult } from './extractTopology';

export interface ZipLimits {
  /** Kích thước IFC tối đa sau giải nén (byte) */
  maxIfcBytes: number;
  /** Tỷ lệ giải nén tối đa (giải nén / nén) — chặn bom zip */
  maxRatio: number;
  /** Số mục tối đa trong tệp nén */
  maxEntries: number;
}
export const zipLimitsFromEnv = (): ZipLimits => ({
  maxIfcBytes: parseInt(process.env.BIM_MAX_IFC_MB || '2048', 10) * 1024 * 1024,
  maxRatio: parseFloat(process.env.BIM_MAX_ZIP_RATIO || '100'),
  maxEntries: parseInt(process.env.BIM_MAX_ZIP_ENTRIES || '1000', 10),
});

const isZipName = (name: string) => /\.(ifczip|zip)$/i.test(name);
const looksZip = (head: Uint8Array) => head[0] === 0x50 && head[1] === 0x4b;

/** Mở tệp nén, kiểm tra số mục / kích thước khai báo / tỷ lệ nén, rồi giải nén mục .ifc theo luồng ra đĩa. */
export async function extractIfcZipToFile(
  zipBytes: Uint8Array,
  dest: string,
  limits: ZipLimits = zipLimitsFromEnv(),
): Promise<{ entry: string; bytes: number; compressed: number }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBytes);
  } catch (err) {
    throw new JobError('ZIP_NO_IFC', `Tệp nén hỏng hoặc không phải ZIP: ${(err as Error).message}`);
  }
  const names = Object.keys(zip.files);
  if (names.length > limits.maxEntries)
    throw new JobError('ZIP_LIMIT', `Tệp nén có ${names.length} mục, vượt giới hạn ${limits.maxEntries}`);
  const entry = names.find((p) => /\.ifc$/i.test(p) && !zip.files[p].dir);
  if (!entry) throw new JobError('ZIP_NO_IFC', 'Không tìm thấy file .ifc trong file nén');
  const meta =
    (zip.files[entry] as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data || {};
  const compressed = Math.max(1, meta.compressedSize || zipBytes.length);
  const declared = meta.uncompressedSize || 0;
  const ratioLimit = Math.min(limits.maxIfcBytes, compressed * limits.maxRatio);
  if (declared > limits.maxIfcBytes)
    throw new JobError(
      'ZIP_LIMIT',
      `IFC giải nén ${Math.round(declared / 1048576)} MB vượt giới hạn ${Math.round(limits.maxIfcBytes / 1048576)} MB`,
    );
  if (declared > compressed * limits.maxRatio)
    throw new JobError(
      'ZIP_LIMIT',
      `Tỷ lệ nén ${Math.round(declared / compressed)}:1 vượt giới hạn ${limits.maxRatio}:1 (nghi bom zip)`,
    );
  // Kích thước khai báo có thể sai: đếm byte thật khi giải nén và dừng ngay khi vượt.
  let bytes = 0;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    const source = zip.files[entry].nodeStream('nodebuffer');
    const fail = (err: Error) => {
      source.unpipe(out);
      out.destroy();
      fs.rmSync(dest, { force: true });
      reject(err);
    };
    source.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > ratioLimit) {
        (source as unknown as { pause: () => void }).pause();
        fail(
          new JobError(
            'ZIP_LIMIT',
            bytes > limits.maxIfcBytes
              ? `IFC giải nén vượt giới hạn ${Math.round(limits.maxIfcBytes / 1048576)} MB`
              : `Tỷ lệ nén vượt giới hạn ${limits.maxRatio}:1 (nghi bom zip)`,
          ),
        );
      }
    });
    source.on('error', (err: Error) => fail(new JobError('ZIP_NO_IFC', `Không giải nén được: ${err.message}`)));
    out.on('error', (err) => fail(err));
    out.on('finish', () => resolve());
    source.pipe(out);
  });
  console.log(
    `[ZIP] Đã giải nén ${entry} (${(bytes / 1048576).toFixed(2)} MB, tỷ lệ ${(bytes / compressed).toFixed(1)}:1)`,
  );
  return { entry, bytes, compressed };
}

/** Chuẩn bị tệp IFC trên đĩa (giải nén nếu cần); trả đường dẫn IFC. */
export async function prepareIfcFile(
  input: string,
  name: string,
  workDir: string,
  limits: ZipLimits = zipLimitsFromEnv(),
): Promise<string> {
  const head = new Uint8Array(4);
  const fd = fs.openSync(input, 'r');
  try {
    fs.readSync(fd, head, 0, 4, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (!isZipName(name) && !looksZip(head)) {
    const size = fs.statSync(input).size;
    if (size > limits.maxIfcBytes)
      throw new JobError(
        'FILE_TOO_LARGE',
        `IFC ${Math.round(size / 1048576)} MB vượt giới hạn ${Math.round(limits.maxIfcBytes / 1048576)} MB`,
      );
    return input;
  }
  const out = path.join(workDir, 'extracted.ifc');
  await extractIfcZipToFile(new Uint8Array(fs.readFileSync(input)), out, limits);
  return out;
}

// Tương thích kiểm thử cũ: giải nén trong bộ nhớ, cùng giới hạn.
export const extractIfcBuffer = async (
  buffer: Uint8Array,
  name = '',
  limits: ZipLimits = zipLimitsFromEnv(),
): Promise<Uint8Array> => {
  if (!isZipName(name) && !looksZip(buffer)) return buffer;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-zip-'));
  try {
    const out = path.join(dir, 'x.ifc');
    await extractIfcZipToFile(buffer, out, limits);
    return new Uint8Array(fs.readFileSync(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

export interface ConvertResult {
  fragBuffer: Uint8Array;
  elements: ExtractedElement[];
  schema: string | null;
  authoringApp: string | null;
  /** Mạng kết nối MEP (cổng, nối cổng, hệ thống); null khi không đọc được */
  topology?: TopologyResult | null;
}

export const convertIfc = async (
  ifcBuffer: Uint8Array,
  onProgress?: (percent: number, message: string) => void,
): Promise<ConvertResult> => {
  const FRAGS = await import('@thatopen/fragments');

  // Bước 1 (0-50%): hình học -> .frag
  console.log(`[CONVERTER] Đang chuyển đổi IFC (${(ifcBuffer.length / 1024 / 1024).toFixed(2)} MB) sang Fragments...`);
  onProgress?.(5, 'Đang chuyển đổi hình học 3D');
  const importer = new FRAGS.IfcImporter();
  importer.wasm = { path: webIfcWasmDir(), absolute: true };
  importer.addAllAttributes();
  importer.addAllRelations();
  // IfcImporter có thể tách dữ liệu đầu vào → truyền bản sao để còn dùng cho bước trích xuất
  const head = Buffer.from(ifcBuffer.subarray(0, 64)).toString('latin1');
  if (!/ISO-10303-21/.test(head))
    throw new JobError('IFC_PARSE', 'Tệp không có tiêu đề ISO-10303-21 (không phải IFC dạng STEP)');
  let fragBuffer: Uint8Array;
  try {
    fragBuffer = await importer.process({ bytes: ifcBuffer.slice(), raw: false });
  } catch (err) {
    throw new JobError('IFC_PARSE', `Không chuyển được hình học IFC: ${(err as Error).message}`);
  }
  console.log(`[CONVERTER] Đã tạo .frag: ${(fragBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  onProgress?.(50, 'Đã tạo mô hình 3D, đang trích xuất cấu kiện');

  // Bước 2 (50-95%): cấu kiện, Pset, Qto, vật liệu
  const api = await openIfcApi();
  try {
    // CIRCLE_SEGMENTS thấp: chỉ dùng để ước tính khối lượng/diện tích, không dùng để hiển thị
    let modelID: number;
    try {
      modelID = api.OpenModel(ifcBuffer, { CIRCLE_SEGMENTS: Number(process.env.BIM_CIRCLE_SEGMENTS || 8) });
    } catch (err) {
      throw new JobError('IFC_PARSE', `Không đọc được tệp IFC: ${(err as Error).message}`);
    }
    if (modelID < 0) throw new JobError('IFC_PARSE', 'web-ifc không mở được mô hình (tệp không phải IFC hợp lệ)');
    const result = extractElements(api, modelID, {
      geometryFallback: process.env.BIM_GEOMETRY_QTO !== 'false',
      onProgress: (p, msg) => onProgress?.(50 + p * 0.45, msg),
    });
    let topology: TopologyResult | null = null;
    try {
      topology = extractTopology(api, modelID, decodeIfcString);
      if (topology.ports || topology.systems.length)
        console.log(
          `[CONVERTER] Mạng MEP: ${topology.ports} cổng, ${topology.connections.length} kết nối, ${topology.systems.length} hệ thống`,
        );
    } catch (err) {
      console.warn('[CONVERTER] Không trích được mạng kết nối MEP:', (err as Error).message);
    }
    api.CloseModel(modelID);
    console.log(
      `[CONVERTER] Trích xuất ${result.elements.length} cấu kiện (schema ${result.schema}, ${result.authoringApp || 'không rõ phần mềm'})`,
    );
    return { fragBuffer, ...result, topology };
  } finally {
    try {
      api.Dispose();
    } catch {
      // ignore
    }
  }
};
