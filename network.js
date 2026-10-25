import { NETWORK_INTERVAL, normalizeInput, validSnapshot } from './core.js';

const PREFIX = 'fighting-x-v2-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const validCode = code => typeof code === 'string' && /^[A-HJ-KM-NP-Z2-9]{6}$/.test(code);
export function makeCode() {
  const values=crypto.getRandomValues(new Uint8Array(6));
  return [...values].map(n=>ALPHABET[n%ALPHABET.length]).join('');
}
export function safeProfile(profile = {}) {
  if(!profile||typeof profile!=='object')profile={};
  return { name: String(profile.name||'Player').slice(0,12),
    fighter: Number.isInteger(profile.fighter)&&profile.fighter>=0&&profile.fighter<5?profile.fighter:4, level:0 };
}

// The host owns simulation and reserves exactly one opponent slot. Signaling only
// discovers peers; gameplay uses an encrypted WebRTC data channel.
export class DuelRoom {
  constructor(callbacks = {}, PeerClass = globalThis.Peer) {
    this.callbacks=callbacks;this.PeerClass=PeerClass;this.closed=false;this.ready=false;this.role='host';
    this.guestToken=null;this.seq=0;this.receivedSeq=-1;this.lastSend=-Infinity;this.lastInput=-Infinity;
    this.lastMessage=Date.now();this.createdAt=Date.now();this.connectedOnce=false;this.retryAt=0;
  }
  async open(role, profile, code = makeCode()) {
    if(!this.PeerClass)throw new Error('Online play could not load. Refresh the page and try again.');
    if(!validCode(code))throw new Error('Enter a six-character game code.');
    this.role=role;this.profile=safeProfile(profile);this.code=code;
    this.token=crypto.randomUUID();this.callbacks.status?.('connecting');
    const options={debug:0};
    // Optional private PeerServer / TURN settings can be supplied by the site owner.
    if(globalThis.FIGHTING_X_NETWORK)Object.assign(options,globalThis.FIGHTING_X_NETWORK);
    this.peer=new this.PeerClass(role==='host'?PREFIX+code.toLowerCase():undefined,options);
    this.peer.on('connection',connection=>this.accept(connection));
    this.peer.on('disconnected',()=>{if(!this.closed&&!this.peer.destroyed){try{this.peer.reconnect()}catch{}}});
    this.peer.on('error',error=>this.peerError(error));
    await new Promise((resolve,reject)=>{
      this.openReject=reject;
      this.openTimer=setTimeout(()=>reject(new Error('The connection service did not respond. Check your internet connection and try again.')),12000);
      this.peer.on('open',()=>{clearTimeout(this.openTimer);this.openReject=null;resolve()});
    });
    if(this.closed)return;
    if(role==='host')this.callbacks.status?.('waiting');else this.connect();
    this.monitor=setInterval(()=>this.tick(),500);
  }
  connect() {
    if(this.closed||this.role!=='guest'||this.pending)return;
    this.pending=true;this.retryAt=Date.now();
    this.bind(this.peer.connect(PREFIX+this.code.toLowerCase(),{
      reliable:true,serialization:'json',metadata:{version:2,token:this.token,profile:this.profile},
    }));
  }
  accept(connection) {
    const meta=connection.metadata||{};
    if(this.role!=='host'||meta.version!==2||typeof meta.token!=='string'||meta.token.length>64){this.reject(connection,'Invalid game connection.');return;}
    if(this.guestToken&&meta.token!==this.guestToken){this.reject(connection,'This room already has two players.');return;}
    if(this.connection?.open&&meta.token===this.guestToken){this.reject(connection,'You are already connected.');return;}
    this.guestToken=meta.token;this.remoteProfile=safeProfile(meta.profile);this.bind(connection);
  }
  reject(connection,reason) {
    connection.on('open',()=>{connection.send({type:'rejected',reason});setTimeout(()=>connection.close(),200)});
    setTimeout(()=>connection.close(),5000);
  }
  bind(connection) {
    this.connection=connection;
    connection.on('open',()=>{
      if(this.closed){connection.close();return;}
      this.pending=false;this.lastMessage=Date.now();this.receivedSeq=-1;
      if(this.role==='host'){
        connection.send({type:'welcome',version:2,profile:this.profile});this.markReady();
      }
    });
    connection.on('data',message=>{if(this.connection===connection)this.receive(message)});
    const dropped=()=>{if(!this.closed&&this.connection===connection){this.pending=false;this.ready=false;this.callbacks.status?.('reconnecting');}};
    connection.on('close',dropped);connection.on('error',dropped);
  }
  markReady() {
    const reconnect=this.connectedOnce;this.ready=true;this.connectedOnce=true;this.lastMessage=Date.now();
    this.callbacks.status?.('connected');this.callbacks.ready?.(this.remoteProfile,reconnect);
  }
  receive(message) {
    if(!message||typeof message!=='object'||typeof message.type!=='string')return;
    this.lastMessage=Date.now();
    if(message.type==='welcome'&&this.role==='guest'&&message.version===2){this.remoteProfile=safeProfile(message.profile);this.markReady();return;}
    if(message.type==='rejected'){this.fail(message.reason||'This room is full.');return;}
    if(message.type==='ping'){this.send({type:'pong',at:message.at});return;}
    if(message.type==='pong'){this.callbacks.ping?.(Math.max(0,Date.now()-message.at));return;}
    if(!this.ready)return;
    if(message.type==='leave'){this.fail('Your opponent left the room. Create or join a new game.');return;}
    if(message.type==='input'&&this.role==='host'&&Date.now()-this.lastInput>=NETWORK_INTERVAL*.7){
      if(!Number.isSafeInteger(message.seq)||message.seq<=this.receivedSeq)return;
      this.receivedSeq=message.seq;this.lastInput=Date.now();this.callbacks.input?.(normalizeInput(message.input));
    }
    if(message.type==='state'&&this.role==='guest'&&Number.isSafeInteger(message.seq)&&message.seq>this.receivedSeq&&validSnapshot(message.state)){
      this.receivedSeq=message.seq;this.callbacks.state?.(message.state);
    }
    if(message.type==='rematch'&&this.role==='host')this.callbacks.rematch?.();
  }
  send(message) {
    if(!this.connection?.open||this.closed||this.connection.bufferSize>2)return false;
    try{this.connection.send(message);return true}catch{return false}
  }
  sendInput(input) { if(this.ready)this.send({type:'input',seq:++this.seq,input:normalizeInput(input)}); }
  sendState(state) { if(this.ready)this.send({type:'state',seq:++this.seq,state}); }
  rematch() { if(this.ready)this.send({type:'rematch'}); }
  tick() {
    if(this.closed)return;const now=Date.now();
    if(this.peer.disconnected&&now-this.retryAt>2000){this.retryAt=now;try{this.peer.reconnect()}catch{}}
    if(this.connection?.open)this.send({type:'ping',at:now});
    const silence=now-this.lastMessage;
    if(silence>3000&&this.connectedOnce){
      if(this.ready){this.ready=false;this.callbacks.status?.('reconnecting');}
      if(this.role==='guest'&&now-this.retryAt>2000){this.connection?.close();this.pending=false;this.connect();}
      if(this.role==='host'&&this.connection?.open)this.connection.close();
    }
    if(!this.ready&&this.role==='guest'&&now-this.retryAt>4000){this.connection?.close();this.pending=false;this.connect();}
    if(silence>30000&&(this.connectedOnce||this.role==='guest'))this.fail('Could not reconnect. Check your connection, then create or join a new game.');
  }
  peerError(error) {
    if(this.closed)return;
    if(error.type==='peer-unavailable'&&this.connectedOnce){this.pending=false;return;}
    const messages={ 'unavailable-id':'That room code is in use. Please create another game.',
      'peer-unavailable':'Game not found. Check the code and keep the host’s game open.',
      'network':'The signaling service is unreachable. Check your internet connection.',
      'browser-incompatible':'Online play needs a browser that supports WebRTC. Try a current Safari, Chrome, Firefox, or Edge.' };
    const message=messages[error.type]||'Could not connect. Try another network or create a new room.';
    this.openReject?.(new Error(message));this.fail(message);
  }
  fail(message) { if(this.closed)return;this.callbacks.error?.(message);this.close(false); }
  close(notify=true) {
    if(this.closed)return;if(notify)this.send({type:'leave'});
    this.closed=true;this.ready=false;clearInterval(this.monitor);clearTimeout(this.openTimer);
    this.connection?.close();this.peer?.destroy();
  }
}
