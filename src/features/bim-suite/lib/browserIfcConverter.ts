import * as FRAGS from '@thatopen/fragments';
import JSZip from 'jszip';
import * as WEBIFC from 'web-ifc';
import { supabase } from '../adapters/supabase';
import { decodeIfcString, extractElements, type ExtractResult } from '../../../../worker/bim-converter/extractElements';
import { extractTopology, type TopologyResult } from '../../../../worker/bim-converter/extractTopology';
import type { BimModel } from '../types/bim.types';

export interface BrowserConversionWarning {
  ma: string;
  muc: 'info' | 'warn' | 'error';
  thong_bao: string;
  chi_tiet?: Record<string, unknown>;
}

const getIfcWasmUrl = (): string =>
  typeof window !== 'undefined' ? new URL('/drawing-assets/ifc/', window.location.origin).href : '/drawing-assets/ifc/';
const BATCH_SIZE = 500;
const activeModelConversions = new Set<string>();

export interface BrowserConvertOptions {
  /** Nếu vừa tải lên từ trình duyệt, truyền trực tiếp file gốc để không phải tải lại từ Storage */
  sourceFile?: File | Blob | Uint8Array | null;
  onProgress?: (percent: number, message: string) => void;
}

export interface BrowserConvertResult {
  skipped: boolean;
  model?: BimModel;
  elementCount?: number;
}

const isZipBytes = (bytes: Uint8Array): boolean =>
  bytes.byteLength >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

async function unwrapIfcBytes(rawBytes: Uint8Array): Promise<Uint8Array> {
  if (!isZipBytes(rawBytes)) return rawBytes;
  const zip = await JSZip.loadAsync(rawBytes);
  const ifcEntry = Object.values(zip.files).find((entry) => !entry.dir && /\.ifc$/i.test(entry.name));
  if (!ifcEntry) {
    throw new Error('Không tìm thấy tệp .ifc bên trong gói nén .ifczip');
  }
  return new Uint8Array(await ifcEntry.async('arraybuffer'));
}

async function resolveIfcBytes(
  model: Pick<BimModel, 'id' | 'ifc_path'>,
  sourceFile?: File | Blob | Uint8Array | null,
): Promise<Uint8Array> {
  if (sourceFile instanceof Uint8Array) {
    return unwrapIfcBytes(sourceFile);
  }
  if (sourceFile instanceof Blob) {
    const ab = await sourceFile.arrayBuffer();
    return unwrapIfcBytes(new Uint8Array(ab));
  }
  if (!model.ifc_path) {
    throw new Error('Mô hình không có đường dẫn tệp IFC gốc trên Storage');
  }
  const { data, error } = await supabase.storage.from('bim-models').download(model.ifc_path);
  if (error || !data) {
    throw new Error(`Không tải được tệp IFC từ Storage: ${error?.message || 'Không rõ lỗi'}`);
  }
  const ab = await data.arrayBuffer();
  return unwrapIfcBytes(new Uint8Array(ab));
}

function buildConversionWarnings(extraction: ExtractResult): BrowserConversionWarning[] {
  const warnings: BrowserConversionWarning[] = [];
  if (extraction.elements.length === 0) {
    warnings.push({
      ma: 'NO_ELEMENTS',
      muc: 'error',
      thong_bao: 'Không trích xuất được cấu kiện nào từ tệp IFC.',
    });
  }
  const g = extraction.georef;
  if (!g) {
    warnings.push({
      ma: 'MISSING_GEOREF',
      muc: 'info',
      thong_bao: 'Mô hình chưa khai báo tọa độ địa lý (IfcMapConversion / IfcSite). Đã dùng gốc tọa độ cục bộ.',
    });
  } else if (Math.abs(g.eastings ?? 0) > 10_000 || Math.abs(g.northings ?? 0) > 10_000) {
    warnings.push({
      ma: 'LARGE_COORDS',
      muc: 'warn',
      thong_bao: `Tọa độ gốc lớn (E=${Math.round(g.eastings ?? 0)}m, N=${Math.round(g.northings ?? 0)}m). Đã tự động dịch về gốc để tránh rung hình 3D.`,
      chi_tiet: { eastings: g.eastings, northings: g.northings, crs: g.crs ?? null },
    });
  }
  const qtoRatio = extraction.qtoMissingRatio ?? 0;
  if (qtoRatio > 0.2) {
    const pct = Math.round(qtoRatio * 100);
    warnings.push({
      ma: 'MISSING_QTO',
      muc: 'warn',
      thong_bao: `${pct}% cấu kiện chính (${extraction.qtoMissingCount ?? 0} cấu kiện) thiếu bộ khối lượng Qto; đã tự động ước tính từ hình học 3D.`,
      chi_tiet: { ratio: qtoRatio, count: extraction.qtoMissingCount ?? 0 },
    });
  }
  return warnings;
}

export function isModelConvertingInBrowser(modelId: string): boolean {
  return activeModelConversions.has(modelId);
}

/**
 * Chuyển đổi trực tiếp tệp IFC -> Fragments (.frag) + trích xuất cấu kiện ngay trên trình duyệt bằng WebAssembly.
 * Không cần Docker hay máy chủ worker chạy nền.
 */
export async function convertBimModelInBrowser(
  model: Pick<BimModel, 'id' | 'project_id' | 'file_name' | 'ifc_path' | 'status'>,
  options: BrowserConvertOptions = {},
): Promise<BrowserConvertResult> {
  if (activeModelConversions.has(model.id)) {
    return { skipped: true };
  }

  activeModelConversions.add(model.id);
  const startedAt = performance.now();
  let jobId: string | null = null;

  try {
    options.onProgress?.(5, 'Đang khởi tạo phiên chuyển đổi mô hình trên trình duyệt...');
    const { data: claimedJobId, error: claimError } = await supabase.rpc('bim_browser_claim_conversion', {
      p_model: model.id,
    });
    if (claimError) {
      throw new Error(claimError.message || 'Không thể nhận quyền chuyển đổi mô hình');
    }
    if (!claimedJobId) {
      return { skipped: true };
    }
    jobId = String(claimedJobId);

    options.onProgress?.(10, 'Đang đọc tệp IFC...');
    const ifcBytes = await resolveIfcBytes(model, options.sourceFile);

    options.onProgress?.(15, 'Đang biên dịch hình học 3D (.frag) bằng WebAssembly...');
    const wasmUrl = getIfcWasmUrl();
    const importer = new FRAGS.IfcImporter();
    importer.wasm = {
      path: wasmUrl,
      absolute: true,
    };
    importer.addAllAttributes();
    importer.addAllRelations();
    const fragBytes = await importer.process({
      bytes: ifcBytes.slice(),
      raw: false,
      progressCallback: (progress) => {
        const pct = Math.min(48, Math.max(15, Math.round(15 + progress * 33)));
        options.onProgress?.(pct, `Đang dựng hình học 3D (${Math.round(progress * 100)}%)...`);
      },
    });

    if (!fragBytes || fragBytes.byteLength === 0) {
      throw new Error('Không tạo được dữ liệu hình học 3D (.frag) từ tệp IFC');
    }

    const fragPath = `frags/${model.project_id}/${model.id}.frag`;
    options.onProgress?.(50, 'Đang lưu tệp mô hình 3D (.frag) lên đám mây...');
    const fragBuffer = fragBytes.buffer.slice(
      fragBytes.byteOffset,
      fragBytes.byteOffset + fragBytes.byteLength,
    ) as ArrayBuffer;
    const fragBlob = new Blob([fragBuffer], { type: 'application/octet-stream' });

    const { error: uploadError } = await supabase.storage.from('bim-models').upload(fragPath, fragBlob, {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (uploadError) {
      throw new Error(`Không tải được tệp .frag lên Storage: ${uploadError.message}`);
    }

    options.onProgress?.(55, 'Đang trích xuất danh mục cấu kiện, thuộc tính & khối lượng Qto...');
    const ifcApi = new WEBIFC.IfcAPI();
    ifcApi.SetWasmPath(wasmUrl, true);
    await ifcApi.Init();

    let extraction: ExtractResult;
    let topology: TopologyResult = { ports: 0, connections: [], systems: [], orphan: 0 };

    const modelID = ifcApi.OpenModel(ifcBytes, { COORDINATE_TO_ORIGIN: true });
    try {
      extraction = extractElements(ifcApi, modelID, {
        geometryFallback: true,
        onProgress: (p, msg) => {
          const pct = Math.min(84, Math.max(55, Math.round(55 + p * 0.29)));
          options.onProgress?.(pct, msg);
        },
      });
      try {
        topology = extractTopology(ifcApi, modelID, decodeIfcString);
      } catch (topoErr) {
        console.warn('[BrowserIfcConverter] Không trích xuất được mạng MEP:', topoErr);
      }
    } finally {
      try {
        ifcApi.CloseModel(modelID);
      } catch {
        /* ignore */
      }
    }

    const totalElements = extraction.elements.length;
    if (totalElements === 0) {
      await supabase.rpc('bim_browser_stage_elements', {
        p_model: model.id,
        p_job: jobId,
        p_elements: [],
        p_progress: 92,
      });
    } else {
      for (let i = 0; i < totalElements; i += BATCH_SIZE) {
        const batch = extraction.elements.slice(i, i + BATCH_SIZE);
        const doneCount = Math.min(i + batch.length, totalElements);
        const pct = Math.min(96, Math.round(85 + (doneCount / totalElements) * 11));
        options.onProgress?.(pct, `Đang đồng bộ ${doneCount}/${totalElements} cấu kiện...`);
        const { error: stageError } = await supabase.rpc('bim_browser_stage_elements', {
          p_model: model.id,
          p_job: jobId,
          p_elements: batch,
          p_progress: pct,
        });
        if (stageError) {
          throw new Error(`Lỗi ghi cấu kiện (${doneCount}/${totalElements}): ${stageError.message}`);
        }
      }
    }

    options.onProgress?.(98, 'Đang hoàn tất xuất bản mô hình 3D...');
    const warnings = buildConversionWarnings(extraction);
    const totalMs = Math.round(performance.now() - startedAt);
    const patch = {
      frag_path: fragPath,
      element_count: totalElements,
      ifc_schema: extraction.schema,
      phan_mem_tao: extraction.authoringApp,
      georef: extraction.georef,
      canh_bao: warnings,
      chi_so_xu_ly: {
        engine: 'browser-wasm',
        tong_ms: totalMs,
        ifc_bytes: ifcBytes.byteLength,
        frag_bytes: fragBytes.byteLength,
        so_cau_kien: totalElements,
        qto_thieu_ty_le: extraction.qtoMissingRatio,
        mep_ports: topology.ports,
        mep_ket_noi: topology.connections.length,
        mep_he_thong: topology.systems.length,
        hoan_tat_luc: new Date().toISOString(),
      },
      he_thong: topology.systems,
      ket_noi: topology.connections,
    };

    const { data: completedModel, error: completeError } = await supabase.rpc('bim_browser_complete_conversion', {
      p_model: model.id,
      p_job: jobId,
      p_patch: patch,
    });
    if (completeError) {
      throw new Error(`Lỗi hoàn tất chuyển đổi: ${completeError.message}`);
    }

    options.onProgress?.(100, `Hoàn tất chuyển đổi ${totalElements} cấu kiện!`);
    return {
      skipped: false,
      model: completedModel as BimModel,
      elementCount: totalElements,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err || 'Lỗi chuyển đổi IFC');
    console.error('[BrowserIfcConverter] Lỗi chuyển đổi mô hình:', model.file_name, err);
    if (jobId) {
      try {
        await supabase.rpc('bim_browser_fail_conversion', {
          p_model: model.id,
          p_job: jobId,
          p_error: message,
          p_kind: 'transient',
        });
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    activeModelConversions.delete(model.id);
  }
}
