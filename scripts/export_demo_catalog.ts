import {mkdirSync,writeFileSync} from 'node:fs';
import {MOCK_PROJECTS,getProjectTT39Data} from '../src/data/mockData';
mkdirSync('.appraisal-data',{recursive:true});
writeFileSync('.appraisal-data/projects.json',JSON.stringify(MOCK_PROJECTS.map(p=>({...p,tt39_data:getProjectTT39Data(p)}))));
console.log('Exported local demo project catalog. Cloud data was not changed.');
