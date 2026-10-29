import { processSectionBatch, type SectionBatch } from './sectionBatch';
self.onmessage = (event: MessageEvent<SectionBatch>) => {
  try {
    const result = processSectionBatch(event.data);
    self.postMessage(
      { result },
      { transfer: [result.outline.buffer, result.positions.buffer, result.uvs.buffer, result.normals.buffer] },
    );
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Không dựng được mặt cắt.' });
  }
};
