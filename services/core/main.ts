import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import ports from '../../config/runtime-ports.json' with {type:'json'};

class CoreModule {}
Module({})(CoreModule);
const secret = process.env.APPRAISAL_INTERNAL_TOKEN;
if (!secret) throw new Error('Dùng pnpm dev để khởi động cả bộ dịch vụ.');
const app = await NestFactory.create(CoreModule, { bodyParser: false });
app.use('/api/appraisal', express.raw({ type: '*/*', limit: '27mb' }));
app.use('/api/appraisal', async (req: express.Request, res: express.Response) => {
  const origin = req.headers.origin;
  const host = (req.headers.host || '').split(':')[0];
  const testLoginPath=req.path.startsWith('/test-login');
  const localTestLogin=process.env.APPRAISAL_ENVIRONMENT==='staging' && process.env.APPRAISAL_ENABLE_TEST_LOGIN==='true'
    && ['localhost','127.0.0.1'].includes(host)
    && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'');
  if(testLoginPath&&!localTestLogin){res.status(404).json({detail:'Đăng nhập thử nghiệm đang tắt.'});return;}
  if ((process.env.APPRAISAL_MODE || 'demo') === 'demo' && !['localhost', '127.0.0.1'].includes(host)) {
    res.status(403).json({ detail: 'Môi trường dùng thử chỉ cho phép truy cập từ máy cục bộ.' }); return;
  }
  if (origin && ![`http://localhost:${ports.web}`, `http://127.0.0.1:${ports.web}`, process.env.APPRAISAL_ORIGIN].filter(Boolean).includes(origin)) {
    res.status(403).json({ detail: 'Nguồn yêu cầu không được phép.' }); return;
  }
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) { res.sendStatus(405); return; }
  const workerPort = ports.worker;
  try {
    const response = await fetch(`http://127.0.0.1:${workerPort}/v1${req.url}`, {
      method: req.method,
      headers: { 'x-internal-token': secret, 'Content-Type': 'application/json',
        ...(testLoginPath&&localTestLogin?{'x-local-test-login':'true'}:{}),
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: req.method === 'GET' ? undefined : req.body,
      signal: AbortSignal.timeout(120_000),
    });
    res.status(response.status);
    for (const header of ['content-type', 'content-disposition', 'x-content-type-options']) {
      const value = response.headers.get(header); if (value) res.setHeader(header, value);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.status(503).json({ detail: `Dịch vụ xử lý tài liệu chưa sẵn sàng. Kiểm tra AI Worker cổng ${workerPort}.` });
  }
});
await app.listen(ports.core, '127.0.0.1');
