export type PlanItem = {id:string;title:string;kind:string;dose:string;instruction:string};
export type Morning = {wrist:number|null;fingers:number|null;fatigue:number|null;note:string};
export type DayEntry = {
  date:string; goal:string; climbing:string; conditioning:string;
  templateId:string|null; plan:PlanItem[];
  duration:number|null; rpe:number|null; leftWrist:number|null; morning:Morning;
  createdAt:string; updatedAt:string; revision:number;
};
export type ExerciseDefinition = {id:string;mode:string;title:string;kind:string;dose:string;instruction:string;minutes:number|null;source:string;section:string};
export type ProgramPackage = {
  id:string;version:string;title:string;
  sections:{id:string;title:string;text:string;source:string}[];
  exercises:ExerciseDefinition[];
  templates:{id:string;name:string;type:string;exerciseIds:string[]}[];
  weeks:{start:string;end:string;phase:string;a:string;b:string;volume:string;note:string}[];
  sources:{id:string;name:string;kind:string;note:string;url:string}[];
  glossary:Record<string,string>;
  startRules?:{label:string;text:string;source:string}[];
};
export type Settings = {
  id:'main';schemaVersion:number;lastExportAt:string|null;lastChangeAt:string|null;
  programSource:'bundled'|'imported'|null;bundledProgramVersion:string|null;
};
export const today=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export const localDate=(iso:string)=>{const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)};
export function emptyDay(date:string):DayEntry {const now=new Date().toISOString();return {date,goal:'',climbing:'',conditioning:'',templateId:null,plan:[],duration:null,rpe:null,leftWrist:null,morning:{wrist:null,fingers:null,fatigue:null,note:''},createdAt:now,updatedAt:now,revision:0}}
export const hasContent=(day:DayEntry)=>Boolean(day.goal.trim()||day.climbing.trim()||day.conditioning.trim()||day.plan.length||day.duration!==null||day.rpe!==null||day.leftWrist!==null||day.morning.wrist!==null||day.morning.fingers!==null||day.morning.fatigue!==null||day.morning.note.trim());
export const toPlanItem=(exercise:ExerciseDefinition):PlanItem=>({id:exercise.id,title:exercise.title,kind:exercise.kind,dose:exercise.dose,instruction:exercise.instruction});
export const numberOrNull=(text:string)=>{if(!text.trim())return null;const value=Number(text.replace(',','.'));return Number.isFinite(value)?value:null};

// Records from the previous detailed editor stay in IndexedDB and in backups.
// This readable copy lets them appear in the simplified day editor.
export function legacyToDays(records:unknown[]):DayEntry[]{
  const byDate=new Map<string,Record<string,unknown>[]>();
  for(const value of records){if(!value||typeof value!=='object')continue;const w=value as Record<string,unknown>;if(typeof w.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(w.date))continue;byDate.set(w.date,[...(byDate.get(w.date)||[]),w])}
  return [...byDate].map(([date,workouts])=>{
    const day=emptyDay(date),goals:string[]=[],climbing:string[]=[],conditioning:string[]=[];
    for(const w of workouts){
      if(typeof w.goal==='string'&&w.goal.trim())goals.push(w.goal.trim());
      const title=typeof w.title==='string'?w.title:'Тренировка';
      if(w.type==='rest')climbing.push(`${title}: отдых`);
      for(const raw of Array.isArray(w.exercises)?w.exercises:[]){
        if(!raw||typeof raw!=='object')continue;
        const e=raw as Record<string,unknown>,lines=[`${title} · ${String(e.title||'Блок')}`];
        if(typeof e.plan==='string'&&e.plan.trim())lines.push(`План: ${e.plan}`);
        if(typeof e.note==='string'&&e.note.trim())lines.push(`Заметка: ${e.note}`);
        if(Array.isArray(e.climbs))for(const rawClimb of e.climbs){if(!rawClimb||typeof rawClimb!=='object')continue;const c=rawClimb as Record<string,unknown>;lines.push([c.name,c.grade,c.result,c.hardAttempts!=null?`${c.hardAttempts} тяжёлых попыток`:'',c.step,c.hypothesis].filter(Boolean).join(' · '))}
        if(Array.isArray(e.sets))for(const [index,rawSet] of e.sets.entries()){if(!rawSet||typeof rawSet!=='object')continue;const set=rawSet as Record<string,unknown>;lines.push(`Подход ${index+1}: `+[set.seconds!=null?`${set.seconds} с`:'',set.reps!=null?`${set.reps} повторов`:'',set.weight!=null?`${set.weight} кг`:'',set.note].filter(Boolean).join(' · '))}
        (e.kind==='hang'||e.kind==='strength'?conditioning:climbing).push(lines.join('\n'));
        if(typeof e.id==='string'&&typeof e.title==='string'&&!day.plan.some(item=>item.id===String(e.definitionId||e.id)))day.plan.push({id:String(e.definitionId||e.id),title:e.title,kind:String(e.kind||'simple'),dose:String(e.plan||''),instruction:String(e.instruction||'')});
      }
      if(typeof w.summary==='string'&&w.summary.trim())climbing.push(`${title} · итог: ${w.summary}`);
      if(typeof w.nextHypothesis==='string'&&w.nextHypothesis.trim())climbing.push(`${title} · заметка: ${w.nextHypothesis}`);
      if(typeof w.duration==='number')day.duration=(day.duration||0)+w.duration;
      if(typeof w.rpe==='number')day.rpe=w.rpe;
      if(typeof w.wristDuring==='number')day.leftWrist=w.wristDuring;
      if(w.morning&&typeof w.morning==='object'){
        const m=w.morning as Record<string,unknown>;
        if(typeof m.wrist==='number')day.morning.wrist=m.wrist;
        if(typeof m.fingers==='number')day.morning.fingers=m.fingers;
        if(typeof m.fatigue==='number')day.morning.fatigue=m.fatigue;
        if(typeof m.note==='string'&&m.note.trim())day.morning.note=[day.morning.note,m.note].filter(Boolean).join('\n');
      }
    }
    day.goal=goals.join('\n');day.climbing=climbing.join('\n\n');day.conditioning=conditioning.join('\n\n');
    return day;
  });
}
