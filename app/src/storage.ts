import Dexie,{type Table} from 'dexie';
import {emptyDay,legacyToDays,type DayEntry,type ProgramPackage,type Settings} from './model';
import bundledProgram from './program-package.json';

const isObject=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isText=(value:unknown):value is string=>typeof value==='string';
const isNumber=(value:unknown)=>value===null||typeof value==='number'&&Number.isFinite(value);
const isDate=(value:unknown)=>{if(!isText(value)||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),check=new Date(y,m-1,d);return check.getFullYear()===y&&check.getMonth()+1===m&&check.getDate()===d};
const settingsDefault=():Settings=>({id:'main',schemaVersion:3,lastExportAt:null,lastChangeAt:null});

class ClimbDB extends Dexie {
  days!:Table<DayEntry,string>;
  programs!:Table<ProgramPackage,string>;
  settings!:Table<Settings,string>;
  // Kept for lossless migration and backups of records made before the simpler editor.
  workouts!:Table<Record<string,unknown>,string>;
  templates!:Table<Record<string,unknown>,string>;
  constructor(){
    super('climb-tracker');
    this.version(1).stores({workouts:'id,date,status,updatedAt',programs:'id',templates:'id',settings:'id'});
    this.version(2).stores({workouts:'id,date,status,updatedAt,revision',programs:'id',templates:'id',settings:'id'}).upgrade(async tx=>{await tx.table('workouts').toCollection().modify(w=>{w.revision??=0})});
    this.version(3).stores({days:'date,updatedAt,revision',workouts:'id,date,status,updatedAt,revision',programs:'id',templates:'id',settings:'id'}).upgrade(async tx=>{
      const old=await tx.table('workouts').toArray();
      if(old.length)await tx.table('days').bulkPut(legacyToDays(old));
      const settings=await tx.table('settings').get('main');
      await tx.table('settings').put({...settingsDefault(),...settings,schemaVersion:3});
    });
  }
}
export const db=new ClimbDB();
export const getDays=()=>db.days.toArray();
export async function getProgram():Promise<ProgramPackage|null>{
  const saved=await db.programs.toCollection().first();
  if(saved)return saved;
  await importProgram(bundledProgram);
  return await db.programs.toCollection().first()||null;
}
export const getSettings=async()=>await db.settings.get('main')||settingsDefault();

export async function saveDay(day:DayEntry,revision:number){let saved:DayEntry|undefined;await db.transaction('rw',db.days,db.settings,async()=>{
  const current=await db.days.get(day.date);
  if((current?.revision||0)!==revision)throw new Error('Запись изменена в другой вкладке. Перезагрузите день.');
  saved={...structuredClone(day),revision:revision+1,updatedAt:new Date().toISOString()};
  await db.days.put(saved);
  await db.settings.put({...await getSettings(),lastChangeAt:saved.updatedAt});
});return saved!}
export async function deleteDay(date:string,revision:number){await db.transaction('rw',db.days,db.settings,async()=>{const current=await db.days.get(date);if(current&&current.revision!==revision)throw new Error('Запись изменена в другой вкладке. Перезагрузите день.');await db.days.delete(date);await db.settings.put({...await getSettings(),lastChangeAt:new Date().toISOString()})})}

export function assertProgram(value:unknown):asserts value is ProgramPackage {
  if(!isObject(value)||!isText(value.id)||!isText(value.version)||!isText(value.title)||!Array.isArray(value.sections)||!Array.isArray(value.exercises)||!Array.isArray(value.templates)||!Array.isArray(value.weeks)||!Array.isArray(value.sources)||!isObject(value.glossary))throw new Error('Неверный формат программы');
  if(value.startRules!==undefined&&(!Array.isArray(value.startRules)||value.startRules.some(r=>!isObject(r)||!isText(r.label)||!isText(r.text)||!isText(r.source))))throw new Error('Программа содержит повреждённые правила');
  if(value.sections.some(s=>!isObject(s)||!isText(s.id)||!isText(s.title)||!isText(s.text))||value.exercises.some(e=>!isObject(e)||!isText(e.id)||!isText(e.mode)||!isText(e.title)||!isText(e.kind)||!isText(e.dose)||!isText(e.instruction)||!isText(e.section))||value.templates.some(t=>!isObject(t)||!isText(t.id)||!isText(t.name)||!Array.isArray(t.exerciseIds)||!t.exerciseIds.every(isText))||value.weeks.some(w=>!isObject(w)||!isDate(w.start)||!isDate(w.end)||!isText(w.phase)||!isText(w.note))||value.sources.some(s=>!isObject(s)||!isText(s.id)||!isText(s.name)||!isText(s.note)||!isText(s.url)||!s.url.startsWith('https://')))throw new Error('Программа содержит повреждённые записи');
  const exerciseIds=new Set(value.exercises.map(e=>e.id));
  if(value.templates.some(t=>t.exerciseIds.some((id:string)=>!exerciseIds.has(id))))throw new Error('В тренировке указано неизвестное упражнение');
}
export async function importProgram(value:unknown){assertProgram(value);await db.transaction('rw',db.programs,db.settings,async()=>{await db.programs.clear();await db.programs.put(value);await db.settings.put({...await getSettings(),lastChangeAt:new Date().toISOString()})})}

export type Backup={schemaVersion:2;appVersion:string;exportedAt:string;days:DayEntry[];programs:ProgramPackage[];settings:Settings;legacyWorkouts:Record<string,unknown>[];legacyTemplates:Record<string,unknown>[]};
export async function makeBackup():Promise<Backup>{return {schemaVersion:2,appVersion:'0.2.0',exportedAt:new Date().toISOString(),days:await db.days.toArray(),programs:await db.programs.toArray(),settings:await getSettings(),legacyWorkouts:await db.workouts.toArray(),legacyTemplates:await db.templates.toArray()}}
export function parseBackup(raw:string):Backup {
  let parsed:unknown;try{parsed=JSON.parse(raw)}catch{throw new Error('Файл не является JSON')}
  if(!isObject(parsed))throw new Error('Неверный формат копии');
  let value:Record<string,unknown>=parsed;
  if(value.schemaVersion===1){
    if(!Array.isArray(value.workouts)||!Array.isArray(value.programs)||!Array.isArray(value.templates)||!isObject(value.settings))throw new Error('Повреждена старая резервная копия');
    for(const p of value.programs)assertProgram(p);
    if(value.workouts.some(w=>!isObject(w)||!isText(w.id)||!isDate(w.date)))throw new Error('Повреждена старая тренировка');
    value={schemaVersion:2,appVersion:'0.2.0',exportedAt:new Date().toISOString(),days:legacyToDays(value.workouts),programs:value.programs,settings:{...settingsDefault(),...value.settings,schemaVersion:3},legacyWorkouts:value.workouts,legacyTemplates:value.templates};
  }
  if(value.schemaVersion!==2)throw new Error(typeof value.schemaVersion==='number'&&value.schemaVersion>2?'Копия создана более новой версией приложения':'Неподдерживаемая версия копии');
  if(!Array.isArray(value.days)||!Array.isArray(value.programs)||!isObject(value.settings)||!Array.isArray(value.legacyWorkouts)||!Array.isArray(value.legacyTemplates)||!isText(value.exportedAt)||!isText(value.appVersion))throw new Error('В копии отсутствуют обязательные данные');
  for(const p of value.programs)assertProgram(p);
  for(const d of value.days){if(!isObject(d)||!isDate(d.date)||!isText(d.goal)||!isText(d.climbing)||!isText(d.conditioning)||!(d.templateId===null||isText(d.templateId))||!Array.isArray(d.plan)||!d.plan.every(p=>isObject(p)&&isText(p.id)&&isText(p.title)&&isText(p.dose)&&isText(p.instruction)&&isText(p.kind))||!isNumber(d.duration)||!isNumber(d.rpe)||!isNumber(d.leftWrist)||!isObject(d.morning)||!isNumber(d.morning.wrist)||!isNumber(d.morning.fingers)||!isNumber(d.morning.fatigue)||!isText(d.morning.note)||!isText(d.createdAt)||!isText(d.updatedAt)||typeof d.revision!=='number'||!Number.isInteger(d.revision))throw new Error('В копии повреждён день')}
  if(new Set(value.days.map(d=>d.date)).size!==value.days.length)throw new Error('В копии повторяются даты');
  if(value.legacyWorkouts.some(w=>!isObject(w)||!isText(w.id))||value.legacyTemplates.some(t=>!isObject(t)||!isText(t.id)))throw new Error('В копии повреждён старый архив');
  if(value.settings.id!=='main'||!(value.settings.lastExportAt===null||isText(value.settings.lastExportAt))||!(value.settings.lastChangeAt===null||isText(value.settings.lastChangeAt)))throw new Error('В копии повреждены настройки');
  return value as Backup;
}
export async function restoreBackup(backup:Backup){await db.transaction('rw',db.days,db.programs,db.settings,db.workouts,db.templates,async()=>{
  await Promise.all([db.days.clear(),db.programs.clear(),db.settings.clear(),db.workouts.clear(),db.templates.clear()]);
  await db.days.bulkPut(backup.days);await db.programs.bulkPut(backup.programs);await db.workouts.bulkPut(backup.legacyWorkouts);await db.templates.bulkPut(backup.legacyTemplates);
  await db.settings.put({...backup.settings,schemaVersion:3});
})}
export async function shareBackup(backup:Backup){const file=new File([JSON.stringify(backup,null,2)],`climb-backup-${new Date().toISOString().slice(0,10)}.json`,{type:'application/json'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Резервная копия Камень'});return 'shared'}catch(e){if((e as DOMException).name==='AbortError')return 'cancelled'}}const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);return 'downloaded'}
export async function markExport(){await db.settings.put({...await getSettings(),lastExportAt:new Date().toISOString()})}
export {emptyDay};
