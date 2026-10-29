import { readFile, writeFile } from 'node:fs/promises';
const contract = JSON.parse(await readFile('services/appraisal/data/api-contract.json', 'utf8'));
await writeFile('docs/api/openapi.json', JSON.stringify(contract, null, 2) + '\n');
