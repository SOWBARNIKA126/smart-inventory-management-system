import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const en=JSON.parse(fs.readFileSync('src/lib/i18n/messages/en.json','utf8'));
const normalize=text=>text.replaceAll('_',' ').replace(/\s+/g,' ').trim().toLowerCase();
const keys=new Set(Object.keys(en).map(normalize));
const missing=new Map();
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.tsx')){const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(source)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])){const key=node.arguments[0].text;if(/[a-zA-Z]/.test(key)&&!keys.has(normalize(key)))missing.set(key,file)}ts.forEachChild(node,visit)}visit(source)}}}
scan('src/app');scan('src/components');
console.log('Uncataloged literal calls:',Object.fromEntries(missing));
for(const file of fs.readdirSync('src/lib/i18n/messages')){const catalog=JSON.parse(fs.readFileSync(`src/lib/i18n/messages/${file}`,'utf8'));console.log(file,Object.keys(catalog).length)}
