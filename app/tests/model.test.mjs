import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDay,hasContent,legacyToDays,localDate,numberOrNull,today} from '../src/model.ts';

test('пустой день не помечается, а запись и нулевая оценка помечаются',()=>{
  const day=emptyDay('2026-09-22');
  assert.equal(hasContent(day),false);
  day.goal='   ';assert.equal(hasContent(day),false);
  day.rpe=0;assert.equal(hasContent(day),true);
});

test('даты остаются локальными, десятичная запятая принимается',()=>{
  assert.equal(today(localDate('2026-10-01')),'2026-10-01');
  assert.equal(numberOrNull('0,5'),0.5);
  assert.equal(numberOrNull(''),null);
});

test('старые блоки собираются в свободный текст одного дня',()=>{
  const date='2026-09-22';
  const records=[{id:'one',date,title:'Тренировка А',goal:'Техника',duration:90,rpe:6,wristDuring:1,morning:{wrist:2,fingers:0,fatigue:3,note:'лучше'},exercises:[
    {id:'climb',title:'Лазание',kind:'climb',plan:'три трассы',climbs:[{name:'Синяя',grade:'7A',result:'пройдено',hardAttempts:3}]},
    {id:'hang',title:'Висы',kind:'hang',sets:[{seconds:7,weight:0.5}]}
  ]},{id:'two',date,title:'Вечером',duration:30,exercises:[]}];
  const [day]=legacyToDays(records);
  assert.equal(day.date,date);
  assert.equal(day.goal,'Техника');
  assert.match(day.climbing,/Синяя · 7A · пройдено · 3 тяжёлых попыток/);
  assert.match(day.conditioning,/Подход 1: 7 с · 0.5 кг/);
  assert.deepEqual(day.plan.map(item=>item.id),['climb','hang']);
  assert.equal(day.duration,120);
  assert.equal(day.rpe,6);
  assert.equal(day.leftWrist,1);
  assert.equal(day.morning.fingers,0);
});
