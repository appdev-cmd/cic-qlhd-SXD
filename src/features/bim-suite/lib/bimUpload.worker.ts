/// <reference lib="webworker" />
// Băm SHA-256 và nén ZIP tệp IFC ngoài luồng giao diện (tệp tới 500 MB không làm đứng trình duyệt).
import JSZip from 'jszip';
import { sha256Blob } from './sha256';

type Request = { id: number; op: 'hash'; file: Blob } | { id: number; op: 'zip'; file: Blob; name: string };

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  try {
    if (req.op === 'hash') {
      const hex = await sha256Blob(req.file, (done, total) =>
        post({ id: req.id, type: 'progress', percent: total ? (done / total) * 100 : 100 }),
      );
      post({ id: req.id, type: 'done', result: hex });
    } else {
      const zip = new JSZip();
      zip.file(req.name, req.file);
      let last = -1;
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, streamFiles: true },
        (meta) => {
          const percent = Math.floor(meta.percent);
          if (percent !== last) {
            last = percent;
            post({ id: req.id, type: 'progress', percent });
          }
        },
      );
      post({ id: req.id, type: 'done', result: blob });
    }
  } catch (error) {
    post({ id: req.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
