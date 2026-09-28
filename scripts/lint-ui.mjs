import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):/\.tsx?$/.test(entry.name)?[join(directory,entry.name)]:[]);
let errors=0;
for(const file of files('src')) {
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const report=(node,message)=>{const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;console.error(`${file}:${line}: ${message}`);errors++;};
  const visit=node=>{
    if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
      const tag=node.tagName.getText(source);
      if(/^[a-z]/.test(tag))for(const attribute of node.attributes.properties)if(ts.isJsxAttribute(attribute)) {
        const name=attribute.name.getText(source),value=attribute.initializer?.getText(source);
        if(name==='title')report(attribute,'Dùng Tooltip hoặc AutoTableTooltip thay HTML title.');
        if(tag==='input'&&name==='type'&&value==='"date"')report(attribute,'Dùng DateInput.');
      }
      if(tag==='select')report(node,'Dùng SearchableSelect (enum ngắn cần allowlist được review).');
    }
    if(ts.isPropertyAccessExpression(node)&&node.name.text==='toLocaleDateString')report(node,'Dùng formatDate/formatDateTime.');
    ts.forEachChild(node,visit);
  };visit(source);
}
console.log(`UI scan: ${errors} vi phạm.`);process.exitCode=errors?1:0;
