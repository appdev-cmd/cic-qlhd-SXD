import { Ajv2020 } from 'ajv/dist/2020.js';
import { fullFormats } from 'ajv-formats/dist/formats.js';
import api from './data/api-contract.json' with { type: 'json' };
import type { components } from '../../src/types/api.gen.js';
import { HttpError } from './errors.js';
import type { RequestHandler } from 'express';
const validator = new Ajv2020({ strict: false, allErrors: true, useDefaults: true, coerceTypes: true });
for (const [name, format] of Object.entries(fullFormats)) validator.addFormat(name, format);
validator.addSchema({ $id: 'appraisal', components: api.components });
type Schemas = components['schemas'];
export function body<N extends keyof Schemas>(name: N, value: unknown): Schemas[N] {
  const key = `appraisal#/components/schemas/${name}`;
  const validate = validator.getSchema(key) || validator.compile({ $ref: key });
  const copy = structuredClone(value);
  if (!validate(copy)) throw new HttpError(422, 'Nội dung yêu cầu không đáp ứng cấu trúc hoặc giới hạn dữ liệu.');
  return copy as Schemas[N];
}
export const contract = api;
type Parameter = { in: string; name: string; required?: boolean; schema: Record<string, unknown> };
const operations = Object.entries(
  api.paths as unknown as Record<string, Record<string, { parameters?: Parameter[] }>>,
).flatMap(([path, methods]) => {
  const names = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const pattern = new RegExp(
    '^' +
      path
        .split(/(\{[^}]+\})/)
        .map((part) => (part.startsWith('{') ? '([^/]+)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('') +
      '/?$',
  );
  return Object.entries(methods).map(([method, operation]) => {
    const parameters = operation.parameters || [];
    const query = parameters.filter((item) => item.in === 'query');
    const pathFields = parameters.filter((item) => item.in === 'path');
    const compile = (items: Parameter[]) =>
      validator.compile({
        type: 'object',
        properties: Object.fromEntries(items.map((item) => [item.name, item.schema])),
        required: items.filter((item) => item.required).map((item) => item.name),
      });
    return { method: method.toUpperCase(), pattern, names, query: compile(query), params: compile(pathFields) };
  });
});
export const validateQuery: RequestHandler = (req, _res, next) => {
  const operation = operations.find((item) => item.method === req.method && item.pattern.test(req.path));
  if (!operation) {
    next();
    return;
  }
  const match = req.path.match(operation.pattern)!;
  const params = Object.fromEntries(operation.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]));
  const query = structuredClone(req.query);
  if (!operation.params(params) || !operation.query(query))
    throw new HttpError(422, 'Tham số đường dẫn hoặc bộ lọc không hợp lệ.');
  Object.defineProperty(req, 'query', { value: query, configurable: true });
  next();
};
