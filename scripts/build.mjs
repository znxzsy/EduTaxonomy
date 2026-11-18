import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFile(path.join(root,name),'utf8');
const [template,styles,app,raw]=await Promise.all(['src/index.template.html','src/styles.css','src/app.js','examples/math-graph.json'].map(read));
const graph=JSON.stringify(JSON.parse(raw)).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const html=template.replace('{{STYLES}}',()=>styles.trim()).replace('{{GRAPH_DATA}}',()=>graph).replace('{{APP}}',()=>app.trim());
if(/\{\{(?:STYLES|GRAPH_DATA|APP)\}\}/.test(html))throw new Error('Unresolved template marker');
if(process.argv.includes('--check')){
 if(await read('index.html')!==html)throw new Error('index.html is out of date. Run node scripts/build.mjs');
 console.log('Built page matches the committed sources.');
}else{
 await fs.writeFile(path.join(root,'index.html'),html);
 console.log(`Built index.html with ${Object.keys(JSON.parse(raw)).length} nodes.`);
}
