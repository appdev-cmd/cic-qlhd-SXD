import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { Store } from './store.js';
import type { Query } from './query.js';
import { runtimeMode, remote } from './auth.js';
import { uid, now, vnToday } from './domain.js';
import { HttpError } from './errors.js';
import { decodeBase64 } from './routes-documents.js';
export const BUCKET = 'appraisal-project-images';
const LABELS: Record<string, string> = {
  phoi_canh: 'Phối cảnh 3D',
  hien_trang: 'Hiện trạng thực địa',
  ban_ve: 'Bản vẽ quy hoạch',
  tien_do: 'Tiến độ thực địa',
};
interface Image {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  category: string;
  categoryLabel: string;
  date: string;
  author: string;
  description: string;
  storagePath?: string;
  sha256?: string;
  size?: number;
}
interface Gallery {
  images: Image[];
  revision: number;
}
export interface ImageInput {
  revision: number;
  title: string;
  category: string;
  description?: string;
  url?: string;
  contentBase64?: string | null;
}
export async function gallerySchema(q: Query) {
  if (q.pg) return;
  await q.run(
    'create table if not exists project_galleries(project_id text primary key,revision integer not null,payload text not null)',
  );
  await q.run(
    'create table if not exists project_image_files(project_id text,id text,data blob,primary key(project_id,id))',
  );
  await q.run(
    'create table if not exists project_image_audit(id text primary key,project_id text,actor text,created_at text,detail text)',
  );
}
export async function readGallery(store: Store, id: string): Promise<Gallery> {
  const project = await store.project(id);
  if (runtimeMode() === 'cloud')
    return { images: (project.images as Image[]) || [], revision: Number(project.images_revision) };
  return store.query(false, async (q) => {
    await gallerySchema(q);
    const row = (await q.run('select revision,payload from project_galleries where project_id=?', [id])).rows[0];
    return {
      images: row ? (JSON.parse(String(row.payload)) as Image[]) : (project.images as Image[]) || [],
      revision: row ? Number(row.revision) : 1,
    };
  });
}
async function saveGallery(
  store: Store,
  id: string,
  revision: number,
  images: Image[],
  detail: string,
  removeId?: string,
  original?: { id: string; data: Buffer },
): Promise<Gallery> {
  return store.query(true, async (q) => {
    if (q.pg)
      return (
        await q.run<{ result: Gallery }>('select public.save_project_images(?,?,?::jsonb) as result', [
          id,
          revision,
          JSON.stringify(images),
        ])
      ).rows[0].result;
    await gallerySchema(q);
    const row = (await q.run('select revision from project_galleries where project_id=?', [id])).rows[0];
    if (Number(row?.revision || 1) !== revision)
      throw new HttpError(409, 'Thư viện ảnh đã thay đổi. Tải lại trước khi lưu.');
    await q.run(
      'insert into project_galleries values(?,?,?) on conflict(project_id) do update set revision=excluded.revision,payload=excluded.payload',
      [id, revision + 1, JSON.stringify(images)],
    );
    if (removeId) await q.run('delete from project_image_files where project_id=? and id=?', [id, removeId]);
    if (original) await q.run('insert into project_image_files values(?,?,?)', [id, original.id, original.data]);
    await q.run('insert into project_image_audit values(?,?,?,?,?)', [
      uid(),
      id,
      JSON.stringify(store.actor),
      now(),
      detail,
    ]);
    return { images, revision: revision + 1 };
  });
}
function editable(store: Store) {
  if (!['officer', 'head_of_department', 'admin'].includes(store.actor.role))
    throw new HttpError(403, 'Tài khoản không có quyền chỉnh sửa thư viện ảnh.');
}
async function removeOriginal(store: Store, path: string) {
  try {
    await remote('/storage/v1/object/' + BUCKET, store.token, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch {
    console.error('Could not remove a private gallery original.');
  }
}
export async function addImage(store: Store, id: string, input: ImageInput) {
  editable(store);
  const current = await readGallery(store, id);
  if (!input.title.trim()) throw new HttpError(422, 'Nhập tiêu đề ảnh.');
  if (input.revision !== current.revision) throw new HttpError(409, 'Thư viện ảnh đã thay đổi. Tải lại trước khi lưu.');
  if (current.images.length >= 200) throw new HttpError(422, 'Tối đa 200 ảnh mỗi dự án.');
  const imageId = uid();
  let data: Buffer | undefined;
  let storagePath: string | undefined;
  let url = input.url?.trim() || '';
  let mime = '';
  if (input.contentBase64) {
    data = decodeBase64(input.contentBase64);
    if (!data.length || data.length > 5 * 1024 * 1024) throw new HttpError(422, 'Ảnh tối đa 5 MB.');
    mime = data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? 'image/jpeg'
      : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP'
          ? 'image/webp'
          : '';
    if (!mime) throw new HttpError(422, 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.');
    try {
      await sharp(data, { limitInputPixels: 25_000_000, failOn: 'warning' }).stats();
    } catch {
      throw new HttpError(422, 'Ảnh không hợp lệ hoặc vượt 25 triệu điểm ảnh.');
    }
    storagePath = id + '/' + imageId;
    url = '/api/appraisal/projects/' + id + '/images/' + imageId + '/content';
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('Invalid URL');
    } catch {
      throw new HttpError(422, 'Chọn tệp ảnh hoặc nhập liên kết HTTPS hợp lệ.');
    }
  }
  const image: Image = {
    id: imageId,
    url,
    thumbnailUrl: url,
    title: input.title.trim(),
    category: input.category,
    categoryLabel: LABELS[input.category],
    date: vnToday(),
    author: store.actor.name,
    description: input.description?.trim() || '',
    ...(data ? { storagePath, sha256: createHash('sha256').update(data).digest('hex'), size: data.length } : {}),
  };
  if (data && runtimeMode() === 'cloud')
    await remote('/storage/v1/object/' + BUCKET + '/' + storagePath, store.token, {
      method: 'POST',
      headers: { 'Content-Type': mime, 'x-upsert': 'false' },
      body: new Uint8Array(data),
    });
  try {
    return await saveGallery(
      store,
      id,
      input.revision,
      [image, ...current.images],
      'Bổ sung ảnh: ' + image.title,
      undefined,
      data ? { id: imageId, data } : undefined,
    );
  } catch (error) {
    if (data && runtimeMode() === 'cloud') await removeOriginal(store, storagePath!);
    throw error;
  }
}
async function target(store: Store, id: string, imageId: string, revision: number) {
  editable(store);
  const current = await readGallery(store, id);
  if (revision !== current.revision) throw new HttpError(409, 'Thư viện ảnh đã thay đổi. Tải lại trước khi lưu.');
  const image = current.images.find((image) => image.id === imageId);
  if (!image) throw new HttpError(404, 'Không tìm thấy ảnh trong thư viện dự án.');
  return { current, image };
}
export async function updateImage(store: Store, id: string, imageId: string, input: ImageInput) {
  const { current, image } = await target(store, id, imageId, input.revision);
  if (!input.title.trim()) throw new HttpError(422, 'Nhập tiêu đề ảnh.');
  const changed = {
    ...image,
    title: input.title.trim(),
    category: input.category,
    categoryLabel: LABELS[input.category],
    description: input.description?.trim() || '',
  };
  return saveGallery(
    store,
    id,
    input.revision,
    current.images.map((image) => (image.id === imageId ? changed : image)),
    'Sửa thông tin ảnh: ' + changed.title,
  );
}
export async function removeImage(store: Store, id: string, imageId: string, revision: number) {
  const { current, image } = await target(store, id, imageId, revision);
  const result = await saveGallery(
    store,
    id,
    revision,
    current.images.filter((image) => image.id !== imageId),
    'Xóa ảnh: ' + image.title,
    runtimeMode() === 'demo' ? imageId : undefined,
  );
  if (runtimeMode() === 'cloud' && image.storagePath) await removeOriginal(store, image.storagePath);
  return result;
}
export async function imageContent(store: Store, projectId: string, imageId: string) {
  const gallery = await readGallery(store, projectId);
  const image = gallery.images.find((image) => image.id === imageId && image.storagePath);
  if (!image) throw new HttpError(404, 'Không tìm thấy bản gốc ảnh trong phạm vi quyền.');
  if (runtimeMode() === 'cloud')
    return Buffer.from(
      await (
        await remote('/storage/v1/object/authenticated/' + BUCKET + '/' + image.storagePath, store.token)
      ).arrayBuffer(),
    );
  return store.query(false, async (q) => {
    await gallerySchema(q);
    const row = (
      await q.run<{ data: Uint8Array }>('select data from project_image_files where project_id=? and id=?', [
        projectId,
        imageId,
      ])
    ).rows[0];
    if (!row) throw new HttpError(404, 'Không tìm thấy bản gốc ảnh.');
    return Buffer.from(row.data);
  });
}
