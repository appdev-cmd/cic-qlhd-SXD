import express, { type ErrorRequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { actorFor, runtimeMode, writable, type Actor } from './auth.js';
import { norms, assistant, scope } from './bim-suite.js';
import { transaction } from './database.js';
import { HttpError } from './errors.js';
import { checkConnection, configured, status } from './provider.js';
import { openDemoDatabase } from './sqlite.js';
import { casesRouter } from './routes-cases.js';
import { documentsRouter } from './routes-documents.js';
import { reviewRouter } from './routes-review.js';
import { catalogRouter } from './routes-catalog.js';
import { validateQuery } from './validation.js';
import { exportsRouter } from './routes-exports.js';
import { projectsRouter } from './routes-projects.js';
import { permitsRouter } from './permits.js';
import { bimRouter } from './routes-bim.js';
import { testLoginRouter } from './test-login.js';
import { importSample, buildSamplesZip } from './samples.js';
import { requestStore } from './routes-cases.js';
import { contract } from './validation.js';

export interface RequestContext {
  actor: Actor;
  token: string;
}
export function requestContext(res: express.Response): RequestContext {
  return res.locals.context as RequestContext;
}

/** Native Node worker, shared by loopback development and Vercel Functions. */
export function createWorkerApp(secret = process.env.APPRAISAL_INTERNAL_TOKEN) {
  if (!secret) throw new Error('APPRAISAL_INTERNAL_TOKEN is required. Use pnpm dev.');
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  app.use('/v1', (req, _res, next) => {
    const token = req.get('x-internal-token') || '';
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(403, 'Chỉ nhận yêu cầu qua Core API.');
    next();
  });
  app.get('/v1/runtime', (_req, res) => {
    const mode = runtimeMode();
    res.json({
      mode,
      environment: process.env.APPRAISAL_ENVIRONMENT || (mode === 'demo' ? 'demo' : 'staging'),
      authenticationRequired: mode !== 'demo',
    });
  });
  app.use(express.json({ limit: '27mb' }));
  app.use('/v1/test-login', testLoginRouter());
  if (!process.env.VERCEL) app.get('/openapi.json', (_req, res) => res.json(contract));
  app.use('/v1', async (req, res, next) => {
    const token = req.get('authorization') || '';
    res.locals.context = { token, actor: await actorFor(token) } satisfies RequestContext;
    next();
  });
  app.use(validateQuery);
  app.use('/v1', casesRouter());
  app.use('/v1', documentsRouter());
  app.use('/v1', reviewRouter());
  app.use('/v1', catalogRouter());
  app.use('/v1', exportsRouter());
  app.use('/v1', projectsRouter());
  app.use('/v1', permitsRouter());
  app.use('/v1', bimRouter());
  app.post('/v1/samples/:scenario', async (req, res) =>
    res.json(await importSample(requestStore(res), req.params.scenario)),
  );
  app.get('/v1/samples.zip', async (_req, res) => {
    if (process.env.VERCEL) throw new HttpError(404, 'Bộ mẫu chỉ có ở môi trường cục bộ.');
    res
      .type('application/zip')
      .attachment('bo-ho-so-mau-bcnckt.zip')
      .send(await buildSamplesZip());
  });
  app.get('/v1/health', (_req, res) => {
    res.json({
      status: 'ok',
      mode: runtimeMode(),
      modelConfigured: configured(),
      modelProvider: status(),
      actor: requestContext(res).actor,
      formats: ['pdf', 'docx', 'txt'],
      ocrAvailable: configured(),
    });
  });
  app.get('/v1/readiness', async (_req, res) => {
    if (runtimeMode() === 'cloud')
      await transaction(requestContext(res).actor.id, async (client) => {
        const secure = (
          await client.query<{ secure: boolean }>(
            'select not (rolsuper or rolbypassrls) as secure from pg_roles where rolname=current_user',
          )
        ).rows[0]?.secure;
        if (!secure) throw new HttpError(503, 'Kết nối runtime có quyền quản trị vượt mức.');
        await client.query('select id from public.appraisal_cases limit 1');
      });
    else {
      const database = openDemoDatabase();
      try {
        database.prepare('select id from cases limit 1').all();
      } finally {
        database.close();
      }
    }
    res.json({
      ready: true,
      mode: runtimeMode(),
      database: 'connected',
      modelConfigured: configured(),
      ocrAvailable: configured(),
    });
  });
  app.get('/v1/bim/norms', (req, res) => {
    if (
      (req.query.q !== undefined && typeof req.query.q !== 'string') ||
      (req.query.book !== undefined && typeof req.query.book !== 'string')
    ) {
      throw new HttpError(422, 'Bộ lọc định mức không hợp lệ.');
    }
    res.json(norms(req.query.q as string | undefined, req.query.book as string | undefined));
  });
  app.get('/v1/bim/assistant/policy', async (req, res) => {
    if (typeof req.query.projectId !== 'string') throw new HttpError(422, 'Cần chọn dự án BIM.');
    await scope(requestContext(res), req.query.projectId);
    res.json({ enabled: true, toolGroups: ['bim'] });
  });
  app.post('/v1/bim/assistant', async (req, res) => {
    // The assistant only writes its own audit record; Auth and SQL/RPC enforce workspace scope.
    res.json(await assistant(requestContext(res), req.body || {}));
  });
  app.post('/v1/model/check', async (_req, res) => {
    writable(requestContext(res).actor);
    res.json(await checkConnection());
  });
  app.use((_req, res) => res.status(404).json({ detail: 'Không tìm thấy API.' }));
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ detail: error.message });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ detail: 'Dữ liệu yêu cầu quá lớn.' });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(422).json({ detail: 'Nội dung JSON không hợp lệ.' });
      return;
    }
    res.status(500).json({ detail: 'Không hoàn tất được yêu cầu. Vui lòng thử lại.' });
  };
  app.use(errors);
  return app;
}

/** Same-origin serverless boundary; callers cannot inject loopback-only headers. */
export function createServerlessGateway(options: { secret?: string; origins?: string[] } = {}) {
  const secret = options.secret || process.env.APPRAISAL_INTERNAL_TOKEN;
  if (!secret) throw new Error('APPRAISAL_INTERNAL_TOKEN is required.');
  const origins = new Set(
    (
      options.origins || [
        process.env.APPRAISAL_ORIGIN || 'https://cic-qlhd-sxd.vercel.app',
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
      ]
    ).map((origin) => origin.replace(/\/$/, '')),
  );
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  app.use(
    '/api/appraisal',
    (req, res, next) => {
      if (/^\/(?:test-login|docs|openapi\.json|samples)/.test(req.path)) {
        res.status(404).json({ detail: 'Endpoint không được công bố trong môi trường triển khai.' });
        return;
      }
      const origin = req.get('origin');
      if (origin && !origins.has(origin.replace(/\/$/, ''))) {
        res.status(403).json({ detail: 'Nguồn yêu cầu không được phép.' });
        return;
      }
      if (!['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
        res.status(405).json({ detail: 'Phương thức không được hỗ trợ.' });
        return;
      }
      delete req.headers['x-local-test-login'];
      req.headers['x-internal-token'] = secret;
      req.url = '/v1' + req.url;
      next();
    },
    createWorkerApp(secret),
  );
  app.use((_req, res) => res.status(404).json({ detail: 'Không tìm thấy API.' }));
  return app;
}
