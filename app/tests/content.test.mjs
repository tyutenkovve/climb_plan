import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('публичная папка не содержит резервных копий и исходных документов',async()=>{
 const entries=await readdir(join(root,'public'),{recursive:true});
 assert.ok(entries.every(name=>!name.includes('backup')&&!name.endsWith('.xlsx')&&!name.endsWith('.md')));
 const html=await readFile(join(root,'index.html'),'utf8');
 assert.ok(!html.includes('Программа.md'));
});
test('иконки PWA имеют правильные размеры',async()=>{
 for(const size of [192,512]){const png=await readFile(join(root,'public/icons',`icon-${size}.png`));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
});
test('встроенный пакет сохраняет структуру исходного плана',async()=>{
 const data=JSON.parse(await readFile(join(root,'src/program-package.json'),'utf8'));
 assert.equal(data.sections.length,15);assert.equal(data.startRules.length,14);assert.equal(data.exercises.length,32);assert.equal(data.weeks.length,38);assert.equal(data.sources.length,18);
 const ids=new Set(data.exercises.map(e=>e.id));
 for(const template of data.templates){assert.ok(template.exerciseIds.every(id=>ids.has(id)));if(template.type==='A')assert.equal(template.exerciseIds.length,7)}
 assert.ok(data.sources.every(s=>s.url.startsWith('https://')));
});
