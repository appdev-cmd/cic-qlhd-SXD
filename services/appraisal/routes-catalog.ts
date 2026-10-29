import { Router } from 'express';
import { requestStore, integer } from './routes-cases.js';
import { catalogKind, catalogPage, writeCatalog, catalogHistory } from './catalog.js';
import { body } from './validation.js';
import { dashboard } from './analytics.js';
import { askLegal, evaluation } from './legal-assistant.js';
export function catalogRouter() {
  const router = Router();
  router.get('/catalog/:kind', async (req, res) =>
    res.json(
      await catalogPage(requestStore(res), catalogKind(req.params.kind), {
        search: req.query.search as string,
        category: req.query.category as string,
        status: req.query.status as string,
        offset: integer(req.query.offset),
        limit: integer(req.query.limit, 50, 100),
        sort: req.query.sort as string,
        direction: req.query.direction as string,
      }),
    ),
  );
  router.post('/catalog/:kind', async (req, res) =>
    res.json(await writeCatalog(requestStore(res), catalogKind(req.params.kind), body('CatalogMutation', req.body))),
  );
  router.patch('/catalog/:kind/:id', async (req, res) =>
    res.json(
      await writeCatalog(
        requestStore(res),
        catalogKind(req.params.kind),
        body('CatalogMutation', req.body),
        req.params.id,
      ),
    ),
  );
  router.get('/catalog/:kind/:id/history', async (req, res) =>
    res.json(
      await catalogHistory(requestStore(res), catalogKind(req.params.kind), req.params.id, integer(req.query.offset)),
    ),
  );
  router.get('/dashboard', async (req, res) =>
    res.json(await dashboard(requestStore(res), req.query.kind as string | undefined)),
  );
  router.post('/legal-assistant', async (req, res) => {
    const input = body('LegalQuestion', req.body);
    res.json(await askLegal(requestStore(res), input.question, input.useModel ?? true));
  });
  router.get('/legal-assistant/evaluation', (_req, res) => res.json(evaluation()));
  return router;
}
