import { existsSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { Ajv, type AnySchema } from 'ajv';
import { HttpError } from './errors.js';

export type JsonSchema = Record<string, unknown>;
export interface ModelFile {
  name: string;
  mimeType: string;
  data: Uint8Array;
}
export interface GenerateRequest {
  prompt: string;
  content: string;
  schema: JsonSchema;
  maxTokens?: number;
  file?: ModelFile;
  signal?: AbortSignal;
}
const validator = new Ajv({ strict: false, allErrors: true });
let auth: { path: string; client: GoogleAuth } | undefined;
let connection = { status: 'not_checked', checkedAt: null as string | null, message: '' };

export function providerId(): string {
  return (process.env.AI_PROVIDER || 'openai').toLowerCase();
}
export function modelName(): string {
  return providerId() === 'vertex' ? process.env.VERTEX_MODEL || 'gemini-3.8-flash' : process.env.OPENAI_MODEL || '';
}
function vertexConfig() {
  return {
    project: process.env.VERTEX_PROJECT_ID || '',
    location: process.env.VERTEX_LOCATION || 'global',
    path: process.env.VERTEX_SA_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  };
}
export function configured(): boolean {
  if (providerId() === 'openai') return Boolean(process.env.OPENAI_API_KEY && modelName());
  if (providerId() !== 'vertex') return false;
  const c = vertexConfig();
  return (
    /^[a-z0-9][a-z0-9-]{3,62}$/.test(c.project) &&
    /^[a-z0-9-]+$/.test(c.location) &&
    /^[\w.-]+$/.test(modelName()) &&
    Boolean(c.path && existsSync(c.path))
  );
}
export function status() {
  return {
    id: providerId(),
    label: providerId() === 'vertex' ? 'Vertex AI' : 'OpenAI',
    model: modelName(),
    configured: configured(),
    connection: { ...connection },
  };
}

let probe: Promise<ReturnType<typeof status>> | undefined;
export async function checkConnection(): Promise<ReturnType<typeof status>> {
  if (providerId() !== 'vertex') throw new HttpError(422, 'Chưa chọn nhà cung cấp Vertex AI.');
  if (probe) return probe;
  if (connection.checkedAt && Date.now() - Date.parse(connection.checkedAt) < 15_000) return status();
  probe = (async () => {
    try {
      const result = await generate<{ ok: boolean }>({
        prompt: 'Chỉ trả JSON theo cấu trúc yêu cầu.',
        content: 'Trả về ok bằng true.',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
        maxTokens: 1024,
      });
      if (result.ok !== true) throw new Error('Unexpected probe response');
      connection = {
        status: 'connected',
        checkedAt: new Date().toISOString(),
        message: 'Đã nhận phản hồi từ Vertex AI bằng một yêu cầu thử không chứa hồ sơ.',
      };
    } catch {
      connection = {
        status: 'error',
        checkedAt: new Date().toISOString(),
        message: 'Chưa xác nhận được phản hồi hợp lệ từ Vertex AI.',
      };
    }
    return status();
  })();
  try {
    return await probe;
  } finally {
    probe = undefined;
  }
}

function vertexSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(vertexSchema);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'additionalProperties')
        .map(([key, item]) => [
          key,
          key === 'type' && typeof item === 'string' ? item.toUpperCase() : vertexSchema(item),
        ]),
    );
  return value;
}

/** Server-only credentials. Refusals, truncation and invalid JSON never become accepted findings. */
export async function generate<T>(request: GenerateRequest, transport: typeof fetch = fetch): Promise<T> {
  if (!configured()) throw new HttpError(503, 'Chưa cấu hình nhà cung cấp mô hình.');
  const signal = request.signal
    ? AbortSignal.any([request.signal, AbortSignal.timeout(90_000)])
    : AbortSignal.timeout(90_000);
  let url: string;
  let token: string;
  let body: unknown;
  if (providerId() === 'vertex') {
    const c = vertexConfig();
    if (!auth || auth.path !== c.path)
      auth = {
        path: c.path,
        client: new GoogleAuth({
          keyFile: c.path,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        }),
      };
    token = (await auth.client.getAccessToken()) || '';
    if (!token) throw new HttpError(503, 'Không xác thực được tài khoản dịch vụ Google Cloud.');
    const host = c.location === 'global' ? 'aiplatform.googleapis.com' : `${c.location}-aiplatform.googleapis.com`;
    url = `https://${host}/v1/projects/${c.project}/locations/${c.location}/publishers/google/models/${modelName()}:generateContent`;
    body = {
      systemInstruction: { parts: [{ text: request.prompt }] },
      contents: [
        {
          role: 'user',
          parts: [
            { text: request.content },
            ...(request.file
              ? [
                  {
                    inlineData: {
                      mimeType: request.file.mimeType,
                      data: Buffer.from(request.file.data).toString('base64'),
                    },
                  },
                ]
              : []),
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        responseMimeType: 'application/json',
        responseSchema: vertexSchema(request.schema),
        ...(modelName() === 'gemini-3.8-flash' ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
      },
    };
  } else {
    token = process.env.OPENAI_API_KEY!;
    url = 'https://api.openai.com/v1/responses';
    body = {
      model: modelName(),
      store: false,
      instructions: request.prompt,
      input: request.file
        ? [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: request.content },
                {
                  type: 'input_file',
                  filename: request.file.name,
                  file_data: `data:${request.file.mimeType};base64,${Buffer.from(request.file.data).toString('base64')}`,
                },
              ],
            },
          ]
        : request.content,
      max_output_tokens: request.maxTokens || 4096,
      text: { format: { type: 'json_schema', name: 'appraisal_result', strict: true, schema: request.schema } },
    };
  }
  try {
    const response = await transport(url, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new HttpError(
        response.status === 429 ? 429 : 503,
        `Nhà cung cấp AI chưa xử lý được yêu cầu (HTTP ${response.status}).`,
      );
    const result = await response.json();
    let text: string;
    if (providerId() === 'vertex') {
      const candidate = result.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new Error('Incomplete model response');
      text = (candidate.content?.parts || [])
        .filter((p: { thought?: boolean }) => !p.thought)
        .map((p: { text?: string }) => p.text || '')
        .join('');
    } else {
      if (result.status !== 'completed') throw new Error('Incomplete model response');
      text = (result.output || [])
        .flatMap((o: { content?: unknown[] }) => o.content || [])
        .filter((c: { type?: string }) => c.type === 'output_text')
        .map((c: { text: string }) => c.text)
        .join('');
    }
    const value: unknown = JSON.parse(text);
    if (!validator.validate(request.schema as AnySchema, value)) throw new Error('Invalid model response');
    connection = {
      status: 'connected',
      checkedAt: new Date().toISOString(),
      message: 'Đã nhận phản hồi AI có cấu trúc.',
    };
    return value as T;
  } catch (error) {
    connection = { status: 'error', checkedAt: new Date().toISOString(), message: 'Chưa nhận được kết quả AI hợp lệ.' };
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, 'AI chưa trả kết quả hoàn chỉnh, hợp lệ. Có thể chạy lại.');
  }
}
