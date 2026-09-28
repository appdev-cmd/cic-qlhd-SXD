import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const inherited = new Set(Object.keys(process.env));
for (const file of ['.env', '.env.local', process.env.APPRAISAL_CONFIG_FILE || resolve(homedir(), '.config/buildappraisal/runtime.env')]) {
  if (existsSync(resolve(root, file))) {
    for (const line of readFileSync(resolve(root, file), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);
      if (m && !inherited.has(m[1])) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
const bundled = resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.APPRAISAL_PYTHON || (existsSync(bundled) ? bundled : process.platform === 'win32' ? 'python' : 'python3');
const env = { ...process.env, PYTHONPATH: [resolve(root,'ai/.deps'),resolve(root,'ai'),process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  PYTHONIOENCODING:'utf-8', APPRAISAL_PYTHON:python, APPRAISAL_INTERNAL_TOKEN: process.env.APPRAISAL_INTERNAL_TOKEN || randomBytes(32).toString('hex') };
const command = process.argv[2] || 'dev';
if(command==='test') {
  // Unit tests must never inherit a live provider or cloud persistence configuration.
  env.APPRAISAL_MODE='demo'; env.AI_PROVIDER='openai';
  delete env.APPRAISAL_DATABASE_URL; delete env.GOOGLE_APPLICATION_CREDENTIALS;
  delete env.OPENAI_API_KEY; delete env.OPENAI_MODEL;
}
const children = [];
let stopping=false;
const start = (bin,args) => {
  const p = spawn(bin,args,{ cwd:root,env,stdio:'inherit',windowsHide:true });
  p.on('error',e=>{console.error(e.message);stop();process.exitCode=1;});
  if(command==='dev')p.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}});
  children.push(p); return p;
};
function stop(){stopping=true;for(const p of children)if(!p.killed)p.kill();}
process.on('SIGINT',()=>{stop();process.exit();});
process.on('SIGTERM',()=>{stop();process.exit();});
if(command==='dev') {
  start(python,['-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000']);
  start(process.execPath,['--import','tsx', 'services/core/main.ts']);
  console.log('Core API: http://127.0.0.1:3001/api/appraisal • Worker: 8000');
} else if(command==='seed') {
  const p=start(process.execPath,['--import','tsx','scripts/seed_project_submissions.ts']);
  p.on('exit',code=>{process.exitCode=code??1;});
} else {
  const args = command==='samples' ? ['scripts/build_appraisal_samples.py'] : command==='test' ? ['-m','unittest','discover','-s','ai/tests','-v'] : ['-m','pip','install','--target','ai/.deps','-r','ai/requirements.txt'];
  const p=start(python,args);p.on('exit',code=>{process.exitCode=code??1;});
}
