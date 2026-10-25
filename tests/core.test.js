import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, FIXED_STEP, Match, normalizeSave, awardWin, openReward, upgradeCost, normalizeInput, validSnapshot } from '../core.js';

const profiles=[{name:'One',fighter:4,level:10},{name:'Two',fighter:0,level:5}];
const advance=(match,seconds,inputs=[{},{}],bot=false)=>{for(let i=0;i<Math.ceil(seconds/FIXED_STEP);i++)match.step(FIXED_STEP,inputs,bot)};

test('legacy saves migrate without losing valid progress or allowing invalid values',()=>{
  const save=normalizeSave({name:'Old fighter with a long name',tro:500,coins:80,crates:2,own:[0,4,0,99,-1,'1'],lv:[3,1,99,-5,2],pick:0});
  assert.equal(save.tro,500);assert.equal(save.wins,50);assert.deepEqual(save.own,[4,0]);assert.deepEqual(save.lv,[3,1,10,0,2]);
  assert.equal(save.coins,80);assert.equal(save.pick,0);assert.equal(save.name.length,12);
  assert.equal(normalizeSave({coins:-42,crates:Infinity,pick:2}).pick,4);
});
test('players continue earning crates and coins beyond the trophy cap',()=>{
  const save=normalizeSave({tro:500,wins:50});
  for(let i=0;i<10;i++)awardWin(save);
  assert.equal(save.tro,500);assert.equal(save.wins,60);assert.equal(save.crates,2);assert.equal(save.coins,200);
});
test('four crates guarantee the full roster, followed by useful coin rewards',()=>{
  const save=normalizeSave({crates:5});
  for(let i=0;i<4;i++){const previous=save.own.length;const reward=openReward(save,()=>.999);assert.equal(reward.isNew,true);assert.equal(save.own.length,previous+1)}
  const reward=openReward(save,()=>0);assert.equal(reward.isNew,false);assert.equal(save.coins,100);assert.equal(save.crates,0);
  assert.equal(openReward(save),null);
});
test('new upgrade curve starts at one win and caps at 55 wins per upgrade',()=>{
  assert.equal(upgradeCost(0),20);assert.equal(upgradeCost(9),1100);
  for(let level=1;level<10;level++)assert.ok(upgradeCost(level)>upgradeCost(level-1));
});
test('diagonal movement is normalized, and non-finite network inputs are removed',()=>{
  const input=normalizeInput({x:1,y:1,ax:Infinity,ay:NaN,fire:'yes'});
  assert.ok(Math.abs(Math.hypot(input.x,input.y)-1)<1e-10);assert.equal(input.ax,null);assert.equal(input.fire,false);
  assert.equal(normalizeInput({x:NaN,y:Infinity}).x,0);
  assert.deepEqual(normalizeInput(null),normalizeInput());
  assert.equal(normalizeSave(null).pick,4);
});
test('friendly matches normalize health and damage upgrades for both players',()=>{
  const match=new Match(profiles,{friendly:true});assert.equal(match.state.players[0].maxHp,5);assert.equal(match.state.players[1].maxHp,5);
  const botMatch=new Match(profiles);assert.equal(botMatch.state.players[0].maxHp,17.5);
});
test('countdown does not allow movement or bullets, then movement respects arena walls',()=>{
  const match=new Match(profiles);const initialX=match.state.players[0].x;
  advance(match,1,[{x:1,fire:true},{}]);assert.equal(match.state.players[0].x,initialX);assert.equal(match.state.bullets.length,0);
  advance(match,8,[{x:1},{}]);assert.equal(match.state.players[0].x,ARENA.width-20);
});
test('swept bullet collisions deal damage once and remove the projectile',()=>{
  const match=new Match(profiles,{friendly:true});match.state.phase='play';
  const target=match.state.players[1];target.x=600;target.y=500;
  match.state.bullets=[{id:1,owner:0,x:400,y:500,vx:6000,vy:0,distance:0,damage:1.5}];
  match.step(.05,[{},{}]);assert.equal(target.hp,3.5);assert.equal(match.state.bullets.length,0);
  match.step(.05,[{},{}]);assert.equal(target.hp,3.5);
});
test('the goo eventually ends an unattended round and freezes its result',()=>{
  const match=new Match(profiles,{friendly:true});advance(match,85);
  assert.equal(match.state.phase,'over');const snapshot=JSON.stringify(match.state);advance(match,5);assert.equal(JSON.stringify(match.state),snapshot);
});
test('all difficulties can finish a simulated battle without invalid state',()=>{
  for(const difficulty of ['easy','normal','hard']){
    const match=new Match([{name:'Player',fighter:4},{name:'Bot',fighter:0}],{difficulty,random:()=>.5});
    advance(match,90,[{x:0,y:-.2,fire:true},{}],true);
    assert.equal(match.state.phase,'over');assert.equal(validSnapshot(match.state),true);assert.ok(match.state.bullets.length<100);
  }
});
test('malformed and excessive network snapshots are rejected',()=>{
  const state=new Match(profiles).state;assert.equal(validSnapshot(state),true);
  assert.equal(validSnapshot({...state,players:[]}),false);
  assert.equal(validSnapshot({...state,bullets:Array(101).fill({})}),false);
  assert.equal(validSnapshot({...state,phase:'over',winner:99}),false);
});
