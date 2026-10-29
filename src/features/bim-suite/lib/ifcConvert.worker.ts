/// <reference lib="webworker" />
import * as FRAGS from '@thatopen/fragments';
import * as WEBIFC from 'web-ifc';
import { decodeIfcString, extractElements } from '../../../../worker/bim-converter/extractElements';
import { extractTopology } from '../../../../worker/bim-converter/extractTopology';

self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; wasmUrl: string }>) => {
  const { bytes, wasmUrl } = event.data;
  const progress = (percent: number, message: string) => self.postMessage({ type: 'progress', percent, message });
  const api = new WEBIFC.IfcAPI();
  let modelId: number | undefined;
  try {
    const importer = new FRAGS.IfcImporter();
    importer.wasm = { path: wasmUrl, absolute: true };
    importer.addAllAttributes();
    importer.addAllRelations();
    const fragBytes = await importer.process({
      bytes: bytes.slice(),
      raw: false,
      progressCallback: (p) =>
        progress(
          Math.min(48, Math.max(15, Math.round(15 + p * 33))),
          `Đang dựng hình học 3D (${Math.round(p * 100)}%)…`,
        ),
    });
    if (!fragBytes?.byteLength) throw new Error('Không tạo được hình học Fragments từ IFC.');
    progress(55, 'Đang trích xuất cấu kiện, thuộc tính và khối lượng…');
    api.SetWasmPath(wasmUrl, true);
    await api.Init();
    modelId = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
    const extraction = extractElements(api, modelId, {
      geometryFallback: true,
      onProgress: (p, message) => progress(Math.min(84, Math.round(55 + p * 0.29)), message),
    });
    let topology = { ports: 0, connections: [], systems: [], orphan: 0 } as ReturnType<typeof extractTopology>;
    try {
      topology = extractTopology(api, modelId, decodeIfcString);
    } catch {
      /* Topology is optional for non-MEP IFC. */
    }
    self.postMessage(
      { type: 'done', fragBytes, extraction, topology },
      { transfer: [fragBytes.buffer as ArrayBuffer] },
    );
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Không chuyển đổi được IFC.' });
  } finally {
    if (modelId !== undefined) api.CloseModel(modelId);
    api.Dispose();
  }
};
