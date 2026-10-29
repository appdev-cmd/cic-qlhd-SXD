import * as path from 'path';
import { createRequire } from 'module';
import * as WEBIFC from 'web-ifc';

const require = createRequire(import.meta.url);

/** Thư mục chứa file .wasm của web-ifc (có dấu / cuối). */
export const webIfcWasmDir = (): string =>
  process.env.WEB_IFC_WASM_PATH || path.dirname(require.resolve('web-ifc')).replace(/\\/g, '/') + '/';

export const openIfcApi = async (): Promise<WEBIFC.IfcAPI> => {
  const api = new WEBIFC.IfcAPI();
  api.SetWasmPath(webIfcWasmDir(), true);
  await api.Init(undefined, true);
  return api;
};
