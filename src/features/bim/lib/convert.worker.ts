import * as FRAGS from '@thatopen/fragments';
import * as WEBIFC from 'web-ifc';
import JSZip from 'jszip';
import { extractElements } from '../../../../worker/bim-converter/extractElements';

self.onmessage = async (event: MessageEvent<{ bytes: Uint8Array; origin: string }>) => {
  const api = new WEBIFC.IfcAPI();
  let model: number | undefined;
  const progress = (message: string) => self.postMessage({ type: 'progress', message });
  try {
    let bytes = event.data.bytes;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const zip = await JSZip.loadAsync(bytes);
      const files = Object.values(zip.files).filter((f) => !f.dir && /\.ifc$/i.test(f.name));
      if (files.length !== 1) throw Error('Gói IFCZIP phải chứa đúng một tệp IFC.');
      bytes = new Uint8Array(await files[0].async('arraybuffer'));
    }
    if (bytes.byteLength > 200 * 1024 * 1024) throw Error('Mô hình vượt giới hạn 200 MB sau giải nén.');
    progress('Đang đọc IFC và trích xuất thuộc tính, khối lượng…');
    api.SetWasmPath(event.data.origin + '/bim/ifc/0.0.77/', true);
    await api.Init();
    model = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
    const extracted = extractElements(api, model);
    api.CloseModel(model);
    model = undefined;
    progress('Đang chuyển hình học sang Fragments…');
    const importer = new FRAGS.IfcImporter();
    importer.wasm = { path: event.data.origin + '/bim/ifc/0.0.77/', absolute: true };
    importer.addAllAttributes();
    importer.addAllRelations();
    const frag = await importer.process({ bytes });
    self.postMessage({ type: 'done', extracted, frag }, { transfer: [frag.buffer as ArrayBuffer] });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Không chuyển đổi được IFC.' });
  } finally {
    if (model !== undefined) api.CloseModel(model);
    api.Dispose();
  }
};
