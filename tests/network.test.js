import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DuelRoom, makeCode, validCode } from '../network.js';
import { Match } from '../core.js';

class Connection extends EventEmitter {
  constructor(metadata){super();this.metadata=metadata;this.open=false;this.bufferSize=0}
  send(data){if(this.open)queueMicrotask(()=>{if(this.other.open)this.other.emit('data',structuredClone(data))})}
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close')}}
}
class Peer extends EventEmitter {
  static registry=new Map();
  constructor(id){super();this.id=id||crypto.randomUUID();this.destroyed=false;this.disconnected=false;this.connections=[];queueMicrotask(()=>{
    if(Peer.registry.has(this.id))this.emit('error',{type:'unavailable-id'});else{Peer.registry.set(this.id,this);this.emit('open',this.id)}
  })}
  connect(id,{metadata}){
    const local=new Connection(metadata),remote=new Connection(metadata);local.other=remote;remote.other=local;this.connections.push(local);
    queueMicrotask(()=>{const peer=Peer.registry.get(id);if(!peer){this.emit('error',{type:'peer-unavailable'});return}peer.connections.push(remote);peer.emit('connection',remote);local.open=remote.open=true;local.emit('open');remote.emit('open')});return local;
  }
  reconnect(){}
  destroy(){this.destroyed=true;Peer.registry.delete(this.id);this.connections.forEach(c=>c.close())}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const profile={name:'Test',fighter:4};

test('room codes are valid and generated with enough variation',()=>{
  const codes=new Set(Array.from({length:200},makeCode));assert.equal(codes.size,200);assert.ok([...codes].every(validCode));assert.equal(validCode('ABC'),false);assert.equal(validCode('IIIIII'),false);
});
test('two players exchange state and inputs; a third player is rejected',async t=>{
  let input,state,rejection,rematch=false;
  const host=new DuelRoom({input:value=>input=value,rematch:()=>rematch=true},Peer);
  const guest=new DuelRoom({state:value=>state=value},Peer);
  const third=new DuelRoom({error:message=>rejection=message},Peer);
  t.after(()=>{host.close(false);guest.close(false);third.close(false)});
  await host.open('host',profile,'ABC234');await guest.open('guest',profile,'ABC234');await settle();
  assert.equal(host.ready,true);assert.equal(guest.ready,true);
  guest.sendInput({x:1,y:1,fire:true});await settle();assert.equal(input.fire,true);assert.ok(Math.hypot(input.x,input.y)<=1.000001);
  host.sendState(new Match([profile,profile],{friendly:true}).state);await settle();assert.equal(state.round,1);
  guest.rematch();await settle();assert.equal(rematch,true);
  await third.open('guest',profile,'ABC234');await settle();assert.match(rejection,/two players/);assert.equal(third.closed,true);assert.equal(host.ready,true);
});
test('a temporarily disconnected guest can reclaim its reserved slot',async t=>{
  const reconnections=[];const host=new DuelRoom({ready:(_,again)=>reconnections.push(again)},Peer),guest=new DuelRoom({},Peer);
  t.after(()=>{host.close(false);guest.close(false)});
  await host.open('host',profile,'DEF567');await guest.open('guest',profile,'DEF567');await settle();
  const token=host.guestToken;guest.connection.close();assert.equal(host.ready,false);
  guest.lastMessage-=5000;guest.retryAt-=5000;guest.tick();await settle();
  assert.equal(host.ready,true);assert.equal(guest.ready,true);assert.equal(host.guestToken,token);assert.deepEqual(reconnections,[false,true]);
});
test('reconnect has a time limit and reports an actionable error',async t=>{
  let failure;const host=new DuelRoom({error:value=>failure=value},Peer);t.after(()=>host.close(false));
  await host.open('host',profile,'GHJ789');host.connectedOnce=true;host.lastMessage-=31000;host.tick();assert.match(failure,/Could not reconnect/);assert.equal(host.closed,true);
});
