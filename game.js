import { ARENA, FIGHTERS, DIFFICULTIES, FIXED_STEP, NETWORK_INTERVAL, Match, clamp, normalizeSave, normalizeInput, awardWin, openReward, upgradeCost } from './core.js';
import { Renderer, thumbnail } from './renderer.js';
import { DuelRoom, makeCode, validCode } from './network.js';

const $ = id => document.getElementById(id);
const panel=$('panel'),overlay=$('overlay'),canvas=$('game');
const renderer=new Renderer(canvas),thumbnails=FIGHTERS.map((_,i)=>thumbnail(i));
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const on=(id,fn,event='click')=>{if($(id))$(id).addEventListener(event,fn)};
let save;
try { save=normalizeSave(JSON.parse(localStorage.getItem('fx_save')||'{}')); } catch { save=normalizeSave(); }
let match=null,state=null,room=null,mode=null,view='home',localIndex=0,paused=false,networkReady=false;
let remoteInput=normalizeInput(),remoteInputAt=0,round=0,handledRound=-1,hostWants=false,guestWants=false;
let lastFrame=performance.now(),accumulator=0,lastSend=0,lastHud=0,toastTimer,latency=0,lastHealth=null,lastShots=[0,0];
const keys=new Set(),touch={joyId:null,fireId:null,jx:0,jy:0,ax:null,ay:null,fire:false};

class Sound {
  unlock() { if(!save.sound)return; try{this.context ||= new (window.AudioContext||window.webkitAudioContext)();this.context.resume().catch(()=>{})}catch{} }
  tone(frequency,duration=.08,type='square',volume=.025,delay=0) {
    if(!save.sound||!this.context||document.hidden)return;
    const ctx=this.context,start=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(Math.max(40,frequency*.6),start+duration);
    gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain);gain.connect(ctx.destination);osc.start(start);osc.stop(start+duration);
  }
  win() { [392,494,587,784].forEach((f,i)=>this.tone(f,.18,'triangle',.08,i*.09)); }
}
const sound=new Sound();
function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function persist() {
  save.ts=Date.now();try{localStorage.setItem('fx_save',JSON.stringify(save))}catch{toast('Your browser could not save progress. You can export a backup in Settings.');}
  wallet();
}
function wallet() {
  const compact=value=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value);
  $('wallet').innerHTML=`<span>🏆 ${save.tro}</span><span title="${save.coins.toLocaleString()} coins">🪙 ${compact(save.coins)}</span>${save.crates?`<span>📦 ${compact(save.crates)}</span>`:''}`;
  $('sound').setAttribute('aria-pressed',String(save.sound));$('sound').setAttribute('aria-label',save.sound?'Mute sound':'Enable sound');$('sound').style.opacity=save.sound?'1':'.5';
}
function show(html,narrow=true) {
  panel.innerHTML=html;panel.classList.toggle('narrow',narrow);overlay.hidden=false;overlay.scrollTop=0;resetInput();
  const heading=panel.querySelector('h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}
}
function hide() {overlay.hidden=true;panel.innerHTML='';}
const backButton=(label='Back')=>`<button id="back" class="back">← ${label}</button>`;
const image=(id,cls='')=>`<img class="${cls}" src="${thumbnails[id]}" alt="${FIGHTERS[id].name}" draggable="false">`;
const profile=()=>({name:save.name||'Player',fighter:save.pick,level:save.lv[save.pick]});
function stopMatch() {
  room?.close();room=null;match=null;state=null;mode=null;round=0;handledRound=-1;paused=false;networkReady=false;
  $('match-hud').hidden=true;$('pause').hidden=true;$('settings').hidden=false;resetInput();
}
function home(message='') {
  if(typeof message!=='string')message='';
  stopMatch();view='home';
  const f=FIGHTERS[save.pick];
  show(`<div class="menu-layout"><div class="hero"><div class="eyebrow">A pocket-sized arena. A proper duel.</div><h1>FIGHTING<br><span>X</span></h1><p>Pick your fighter. Dodge the shots. Outlast the blue goo. The last fighter standing takes the win.</p><div class="hero-art">${image(3)}${image(save.pick)}${image(2)}</div><div class="controls"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Move</span><span><kbd>Space</kbd> Fire</span><span><kbd>Esc</kbd> Pause</span></div><p class="small">Welcome, <b>${escape(save.name||'fighter')}</b>. Your progress saves in this browser.</p></div><div class="stack"><div class="card mode-card"><div class="eyebrow">Ready when you are</div><div class="fighter-selected">${image(save.pick)}<div class="info"><h3 style="color:${f.color}">${f.name}</h3><p class="small">${f.rarity} · Level ${save.lv[save.pick]}</p></div><button id="fighters" class="back">Change</button></div><label for="difficulty">Bot difficulty<select id="difficulty">${Object.entries(DIFFICULTIES).map(([key,d])=>`<option value="${key}" ${save.difficulty===key?'selected':''}>${d.label}</option>`).join('')}</select></label><button id="play-bot" class="primary">Play vs bot →</button><div class="divider"></div><button id="friends" class="back">Challenge a friend ↗</button>${message?`<p class="error" role="alert">${escape(message)}</p>`:''}</div><div class="row"><button id="progress" class="back">🏆 Trophy road</button><button id="upgrades" class="back">⚡ Upgrades</button></div>${save.crates?`<button id="crate" class="cyan">📦 Open crate · ${save.crates} waiting</button>`:''}<button id="help" class="link-button small">How to play & controls</button></div></div>`,false);
  on('play-bot',startBot);on('fighters',fighters);on('friends',friends);on('progress',progress);on('upgrades',upgrades);on('crate',crate);on('help',help);
  on('difficulty',()=>{save.difficulty=$('difficulty').value;persist()},'change');
}
function welcome() {
  view='welcome';show(`<div class="stack center"><div class="eyebrow">Your arena awaits</div><h2>Welcome to Fighting X</h2><p>What should we call you?</p><form id="name-form" class="stack"><label for="name">Fighter name<input id="name" maxlength="12" placeholder="Your name" autocomplete="nickname" required></label><button class="primary" type="submit">Enter the arena →</button></form><p class="small">No account needed. Progress is stored on this device.</p></div>`);
  on('name-form',event=>{event.preventDefault();const name=$('name').value.trim().slice(0,12);if(!name)return;save.name=name;persist();if(validCode(inviteCode)){friends();$('room-code').value=inviteCode}else home()},'submit');
}
function fighters() {
  view='fighters';show(`<div class="section-title"><div><div class="eyebrow">Find your favorite</div><h2>Meet the fighters</h2></div>${backButton()}</div><div class="fighter-grid">${[4,3,1,2,0].map(i=>{const f=FIGHTERS[i],owned=save.own.includes(i);return `<button id="fighter-${i}" class="card fighter ${save.pick===i?'selected':''} ${owned?'':'locked'}" ${owned?'':'disabled'} aria-pressed="${save.pick===i}">${image(i)}<h3 style="color:${f.color}">${f.name}</h3><span class="tag">${f.rarity}</span><p class="small">${f.spread.length} shot${f.spread.length===1?'':'s'} · ${owned?`Level ${save.lv[i]}`:'Unlock in a crate'}</p><span class="small ${save.pick===i?'success':'muted'}">${owned?(save.pick===i?'✓ Selected':'Select fighter'):'🔒 Locked'}</span></button>`}).join('')}</div><p class="small" style="margin-top:20px">Each crate unlocks a new fighter until you own all five. Different spreads trade precision for coverage.</p>`,false);
  on('back',home);FIGHTERS.forEach((_,i)=>on(`fighter-${i}`,()=>{save.pick=i;persist();fighters()}));
}
function progress() {
  view='progress';const remaining=5-save.wins%5;
  show(`<div class="stack"><div class="section-title"><div><div class="eyebrow">Every win counts</div><h2>Trophy road</h2></div>${backButton()}</div><div class="stats"><div>🏆 ${save.tro}<small>Trophies / 500</small></div><div>${save.wins}<small>Lifetime wins</small></div><div>📦 ${save.crates}<small>Crates waiting</small></div></div><div class="card stack"><h3>${remaining} win${remaining===1?'':'s'} until your next crate</h3><div class="progress-track"><div style="width:${save.wins%5*20}%"></div></div><p class="small">Win +10 trophies and +20 coins. Every fifth win earns a crate, including after you reach 500 trophies.</p></div><div class="milestones">${Array.from({length:10},(_,i)=>`<div class="milestone ${save.tro>=(i+1)*50?'reached':''}">${save.tro>=(i+1)*50?'✓':'📦'}<br>${(i+1)*50}</div>`).join('')}</div><p>Crates always unlock an unowned fighter. Once you own everyone, each crate gives 100 coins.</p>${save.crates?`<button id="crate" class="cyan">Open a crate</button>`:''}</div>`);
  on('back',home);on('crate',crate);
}
function upgrades() {
  view='upgrades';show(`<div class="stack"><div class="section-title"><div><div class="eyebrow">Build your fighter</div><h2>Upgrades</h2></div>${backButton()}</div><p class="gold">🪙 ${save.coins.toLocaleString()} coins</p><p>Each level adds 25% health and damage in bot battles. Friend duels use level 0 for both players.</p><div>${[4,3,1,2,0].map(i=>{const level=save.lv[i],cost=upgradeCost(level),owned=save.own.includes(i);return `<div class="upgrade-row">${image(i)}<div class="info"><h3 style="color:${FIGHTERS[i].color}">${FIGHTERS[i].name}</h3><p>Level ${level}/10 · +${level*25}% health & damage</p></div>${!owned?'<span class="small muted">🔒 Locked</span>':level>=10?'<span class="gold small">MAX</span>':`<button id="upgrade-${i}" ${save.coins<cost?'disabled':''} aria-label="Upgrade ${FIGHTERS[i].name} for ${cost} coins">🪙 ${cost.toLocaleString()}</button>`}</div>`}).join('')}</div><p class="small">Wins always award 20 coins. Upgrade costs rise gradually, from 20 to 1,100 coins.</p></div>`);
  on('back',home);FIGHTERS.forEach((_,i)=>on(`upgrade-${i}`,()=>{const cost=upgradeCost(save.lv[i]);if(save.own.includes(i)&&save.lv[i]<10&&save.coins>=cost){save.coins-=cost;save.lv[i]++;persist();sound.tone(660,.15,'triangle',.06);upgrades();toast(`${FIGHTERS[i].name} upgraded to level ${save.lv[i]}`)}}));
}
function crate() {
  const reward=openReward(save);if(!reward)return progress();
  persist();view='crate';show(`<div class="stack center"><div class="large-icon crate-spin">📦</div><h2>Opening your crate…</h2><p>A little something for the next duel.</p></div>`);
  setTimeout(()=>{if(view!=='crate')return;const f=FIGHTERS[reward.fighter];sound.win();show(`<div class="stack center"><div class="eyebrow">${reward.isNew?'New fighter unlocked':'Your reward'}</div><div style="height:150px">${image(reward.fighter)}</div><h2 style="color:${f.color}">${reward.isNew?f.name:'+100 coins'}</h2><p>${reward.isNew?`${f.rarity}. Ready for your next battle.`:'Your roster is complete. Put these coins toward an upgrade.'}</p><button id="continue" class="primary">Continue →</button></div>`);on('continue',home)},850);
}
function help() {
  view='help';show(`<div class="stack"><div class="section-title"><h2>How to play</h2>${backButton()}</div><div class="card stack"><h3>Move, aim, survive.</h3><p><b>Phone / tablet:</b> drag the left joystick to move. Hold the red button to auto-aim, or drag it toward your target to aim manually.</p><p><b>Keyboard:</b> WASD or arrow keys move. Hold Space to fire at your opponent. Escape or P pauses bot matches.</p><p><b>Blue goo:</b> the arena shrinks over time. Blue areas damage you every second. The minimap and red arrow help you find your opponent.</p></div><div class="card stack"><h3>Challenge a friend</h3><p>Create a room and share its six-character code or invite link. The host must keep the game open. Two players per room; both accept a rematch.</p><p>Friend duels normalize upgrades to level 0. A disconnected match waits up to 30 seconds to reconnect.</p><p class="small">Online play uses a direct WebRTC connection and PeerJS signaling. If a workplace network or VPN blocks the connection, try a home network or mobile data. Bot battles work without the signaling service.</p></div><p class="small">Progress saves in this browser, without an account. Export a backup in Settings to move it to another device or browser.</p></div>`);on('back',home);
}
function settings() {
  const duringBot=mode==='bot'&&state&&state.phase!=='over';if(duringBot)paused=true;
  view='settings';show(`<div class="stack"><div class="section-title"><h2>Settings</h2>${backButton(duringBot?'Game':'Back')}</div><form id="rename" class="stack"><label for="name">Your name<input id="name" maxlength="12" autocomplete="nickname" value="${escape(save.name)}" required></label><button type="submit">Save name</button></form><div class="divider"></div><button id="toggle-sound">${save.sound?'Mute':'Enable'} sound effects</button><p class="small">Sound effects are generated on your device.</p><div class="divider"></div><h3>Your progress</h3><p class="small">Saved only in this browser. Keep a backup before clearing browser data or moving devices.</p><div class="row"><button id="export">Export backup</button><button id="import">Import backup</button><input id="import-file" type="file" accept="application/json,.json" hidden></div><p id="backup-error" class="error small" role="alert"></p><button id="erase" class="danger">Erase all progress</button></div>`);
  on('back',()=>{if(duringBot){paused=false;view='game';hide();resetClock()}else home()});
  on('rename',event=>{event.preventDefault();const name=$('name').value.trim();if(name){save.name=name.slice(0,12);persist();toast('Name saved')}},'submit');
  on('toggle-sound',()=>{save.sound=!save.sound;persist();sound.unlock();settings()});
  on('export',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(save,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='fighting-x-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
  on('import',()=>$('import-file').click());on('import-file',async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>100000)throw new Error('That backup is too large.');const data=JSON.parse(await file.text());if(!Array.isArray(data.own)||!Array.isArray(data.lv)||typeof data.name!=='string')throw new Error('That is not a Fighting X backup.');const imported=normalizeSave(data);show(`<div class="stack"><h2>Restore this backup?</h2><p>This replaces your current progress with ${escape(imported.name)}’s save: ${imported.tro} trophies, ${imported.coins} coins, and ${imported.own.length} fighters.</p><button id="restore" class="primary">Restore backup</button><button id="cancel">Cancel</button></div>`);on('restore',()=>{save=imported;persist();stopMatch();home();toast('Backup restored')});on('cancel',settings)}catch(error){$('backup-error').textContent=error.message}},'change');
  on('erase',()=>{show(`<div class="stack"><h2>Erase all progress?</h2><p>This removes your name, trophies, coins, fighters, and upgrades from this browser. Export a backup first if you want to keep them.</p><button id="confirm-erase" class="danger">Yes, erase everything</button><button id="cancel">Cancel</button></div>`);on('cancel',settings);on('confirm-erase',()=>{stopMatch();save=normalizeSave();persist();welcome()})});
}
function friends(message='') {
  if(typeof message!=='string')message='';
  view='friends';show(`<div class="stack"><div class="section-title"><div><div class="eyebrow">Settle it in the arena</div><h2>Play a friend</h2></div>${backButton()}</div><div class="card stack"><h3>Your room. Your rival.</h3><p>Create a private duel and share its code. Two players, no account needed.</p><button id="create-room" class="primary">Create game →</button></div><div class="card stack"><h3>Have a code?</h3><form id="join-form" class="stack"><label for="room-code">Six-character game code<input id="room-code" class="code-input" maxlength="6" minlength="6" pattern="[A-Ha-hJ-Kj-kM-Nm-nP-Zp-z2-9]{6}" placeholder="ABC234" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label><button type="submit" class="cyan">Join game</button></form></div><p id="room-error" class="error small" role="alert">${escape(message)}</p><p class="small">Friend duels use level 0 for fair matches. The host needs to keep the game open.</p></div>`);
  on('back',home);on('create-room',()=>connectRoom('host'));on('join-form',event=>{event.preventDefault();const code=$('room-code').value.trim().toUpperCase();if(validCode(code))connectRoom('guest',code);else $('room-error').textContent='Enter a six-character game code.'},'submit');
}
function waitScreen(status='Connecting…') {
  view='wait';show(`<div class="stack center"><div class="eyebrow">Friend duel</div><h2 id="wait-title">${escape(status)}</h2>${room?.code?`<p>Game code</p><div class="code" id="share-code">${room.code}</div><button id="invite" class="cyan">Copy invite link</button>`:''}<p id="wait-info">Keep this game open. The match starts when your friend joins.</p><button id="cancel-room" class="back">Cancel</button></div>`);
  on('cancel-room',home);on('invite',async()=>{const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(url.href);toast('Invite link copied')}catch{show(`<div class="stack"><h2>Invite your friend</h2><p>Copy this link, or share the game code ${room.code}.</p><input id="invite-url" aria-label="Invite link" readonly value="${escape(url.href)}"><button id="done">Done</button></div>`);$('invite-url').select();on('done',()=>waitScreen('Waiting for your friend'))}});
}
async function connectRoom(role,code=makeCode()) {
  stopMatch();mode='online';localIndex=role==='host'?0:1;round=0;handledRound=-1;
  room=new DuelRoom({
    status:status=>{
      networkReady=status==='connected';
      if(status==='waiting')waitScreen('Waiting for your friend');
      else if(status==='reconnecting'&&state){resetInput();view='reconnecting';show(`<div class="stack center"><h2>Reconnecting…</h2><p>The match is on hold. Waiting up to 30 seconds for your opponent.</p><button id="leave-room" class="back">Leave game</button></div>`);on('leave-room',home)}
      else if(status==='connected'&&state){if(state.phase==='over')showResult();else{view='game';hide();resetClock()}}
    },
    ready:(opponent,reconnected)=>{if(localIndex===0&&!reconnected)startOnlineRound(opponent);else if(localIndex===0&&state)room.sendState(state)},
    input:input=>{remoteInput=input;remoteInputAt=performance.now()},
    state:incoming=>{if(incoming.round<round)return;const newRound=incoming.round>round;round=incoming.round;state=incoming;if(newRound){handledRound=-1;view='game';hide();beginHud();lastHealth=null;lastShots=[0,0]}checkResult()},
    rematch:()=>{if(state?.phase==='over'){guestWants=true;if(hostWants)startOnlineRound();else toast('Your opponent is ready for a rematch')}},
    ping:ms=>{latency=ms},
    error:message=>{stopMatch();friends(message)},
  });
  waitScreen('Connecting…');
  const active=room;
  try{await active.open(role,profile(),code);if(room===active&&role==='guest'&&view==='wait')$('wait-info').textContent='Connecting directly to your friend…'}catch(error){if(room===active){stopMatch();friends(error.message)}}
}
function startOnlineRound(opponent=room?.remoteProfile) {
  if(!room||!opponent)return;
  round++;hostWants=guestWants=false;remoteInput=normalizeInput();remoteInputAt=0;
  match=new Match([profile(),opponent],{friendly:true,round});state=match.state;handledRound=-1;lastHealth=null;lastShots=[0,0];
  view='game';hide();beginHud();resetClock();room.sendState(state);
}
function startBot() {
  stopMatch();mode='bot';localIndex=0;round=1;newBotRound();sound.unlock();
}
function newBotRound() {
  const options=[0,1,2,3,4].filter(i=>i!==save.pick),opponent=options[Math.floor(Math.random()*options.length)];
  match=new Match([profile(),{name:`${DIFFICULTIES[save.difficulty].label} bot`,fighter:opponent}],{difficulty:save.difficulty,round});
  state=match.state;handledRound=-1;lastHealth=null;lastShots=[0,0];paused=false;view='game';hide();beginHud();resetClock();
}
function beginHud() {$('match-hud').hidden=false;$('pause').hidden=mode!=='bot';$('settings').hidden=mode==='online';}
function checkResult() {
  if(!state||state.phase!=='over'||handledRound===state.round)return;
  handledRound=state.round;resetInput();
  if(state.winner===localIndex){const reward=awardWin(save);persist();sound.win();toast(`+20 coins${reward.trophies?` · +${reward.trophies} trophies`:''}${reward.crate?' · New crate!':''}`)}
  else if(state.winner!==-1)sound.tone(130,.3,'sawtooth',.04);
  showResult();
}
function showResult() {
  if(!state)return;view='result';$('pause').hidden=true;const won=state.winner===localIndex,draw=state.winner===-1;
  show(`<div class="stack center"><div class="eyebrow">${mode==='bot'?'Bot battle':'Friend duel'} · Round ${state.round}</div><div class="large-icon">${won?'🏆':draw?'🤝':'⚔'}</div><h2 style="color:${won?'var(--lime)':draw?'var(--cyan)':'var(--red)'}">${won?'Victory!':draw?'A perfect draw.':'Next one is yours.'}</h2><p>${won?'+20 coins. One win closer to your next crate.':draw?'Both fighters went down together.':'A new angle. A better dodge. One more round.'}</p><button id="rematch" class="primary">Rematch →</button><button id="return-home" class="back">Back to menu</button></div>`);
  on('return-home',home);on('rematch',()=>{sound.unlock();if(mode==='bot'){round++;newBotRound();return}if(!networkReady)return toast('Waiting for the connection to recover');$('rematch').disabled=true;$('rematch').textContent='Waiting for your opponent…';if(localIndex===0){hostWants=true;if(guestWants)startOnlineRound()}else room.rematch()});
}
function pauseBot() {
  if(mode!=='bot'||!state||state.phase==='over'||paused)return;
  paused=true;view='paused';resetInput();show(`<div class="stack center"><div class="eyebrow">Take a breath</div><h2>Paused</h2><p>Your match will be right here.</p><button id="resume" class="primary">Resume →</button><button id="return-home" class="back">Back to menu</button></div>`);
  on('return-home',home);on('resume',resumeBot);
}
function resumeBot(){if(view!=='paused')return;paused=false;view='game';hide();resetClock();sound.unlock()}
function resetClock(){lastFrame=performance.now();accumulator=0;lastSend=0;resetInput()}
function resetInput(){keys.clear();Object.assign(touch,{joyId:null,fireId:null,jx:0,jy:0,ax:null,ay:null,fire:false})}
function readInput(world=true) {
  const sign=world&&localIndex===1?-1:1;
  return normalizeInput({x:sign*(Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'))+touch.jx),
    y:sign*(Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'))+touch.jy),
    fire:touch.fire||keys.has('Space'),ax:touch.ax==null?null:touch.ax*sign,ay:touch.ay==null?null:touch.ay*sign});
}
function updateTouch(event) {
  const p=renderer.point(event),j=renderer.joy,f=renderer.fire;
  if(event.pointerId===touch.joyId){const dx=p.x-j.x,dy=p.y-j.y,length=Math.max(j.r,Math.hypot(dx,dy));touch.jx=dx/length;touch.jy=dy/length}
  if(event.pointerId===touch.fireId){const dx=p.x-f.x,dy=p.y-f.y,length=Math.hypot(dx,dy);touch.ax=length>14?dx/length:null;touch.ay=length>14?dy/length:null}
}
canvas.addEventListener('pointerdown',event=>{
  if(view!=='game'||!state||state.phase==='over')return;
  event.preventDefault();sound.unlock();const p=renderer.point(event),j=renderer.joy,f=renderer.fire;
  if(touch.joyId==null&&Math.hypot(p.x-j.x,p.y-j.y)<j.r*1.55)touch.joyId=event.pointerId;
  else if(touch.fireId==null&&Math.hypot(p.x-f.x,p.y-f.y)<f.r*1.5){touch.fireId=event.pointerId;touch.fire=true}
  else return;
  canvas.setPointerCapture(event.pointerId);updateTouch(event);
});
canvas.addEventListener('pointermove',updateTouch);
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===touch.joyId){touch.joyId=null;touch.jx=touch.jy=0}if(e.pointerId===touch.fireId){touch.fireId=null;touch.fire=false;touch.ax=touch.ay=null}});
window.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||event.ctrlKey||event.metaKey||event.altKey)return;
  if(['Escape','KeyP'].includes(event.code)){event.preventDefault();if(event.repeat)return;if(view==='paused')resumeBot();else pauseBot();return}
  if(view!=='game')return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyW','KeyA','KeyS','KeyD'].includes(event.code)){event.preventDefault();keys.add(event.code);sound.unlock()}
});
window.addEventListener('keyup',event=>keys.delete(event.code));
function focusLost(){resetInput();if(mode==='bot')pauseBot();if(room&&localIndex===1)room.sendInput(normalizeInput());}
window.addEventListener('blur',focusLost);document.addEventListener('visibilitychange',()=>{if(document.hidden)focusLost();else resetClock()});
window.addEventListener('resize',()=>{renderer.resize();resetInput()});
window.addEventListener('pagehide',()=>room?.close());
on('home',()=>home());on('settings',settings);on('pause',()=>view==='paused'?resumeBot():pauseBot());
on('sound',()=>{save.sound=!save.sound;persist();sound.unlock();if(save.sound)sound.tone(523,.12,'triangle',.06)});
function hud() {
  if(!state)return;const me=state.players[localIndex],opp=state.players[1-localIndex];
  for(const [id,p] of [['player-health',me],['opponent-health',opp]])$(id).innerHTML=`${escape(p.name)} · ${Math.max(0,p.hp).toFixed(1)} / ${p.maxHp}<div class="bar"><i style="width:${clamp(p.hp/p.maxHp*100,0,100)}%"></i></div>`;
  $('connection-status').textContent=mode==='bot'?`${DIFFICULTIES[save.difficulty].label} · ${Math.floor(state.elapsed)}s`:`${networkReady?'Connected':'Reconnecting'} · ${latency} ms · Room ${room?.code||''}`;
}
function frame(now) {
  const dt=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  if(match&&!paused&&(mode==='bot'||(mode==='online'&&localIndex===0&&networkReady))){
    accumulator+=dt;let steps=0;
    while(accumulator>=FIXED_STEP&&steps++<6){
      const local=view==='game'?readInput():normalizeInput();
      const remote=now-remoteInputAt<300?remoteInput:normalizeInput();
      match.step(FIXED_STEP,[local,remote],mode==='bot');accumulator-=FIXED_STEP;
    }
    state=match.state;checkResult();
  }else accumulator=0;
  if(room&&networkReady&&now-lastSend>=NETWORK_INTERVAL){lastSend=now;if(localIndex===0&&state)room.sendState(state);else if(localIndex===1)room.sendInput(view==='game'?readInput():normalizeInput())}
  if(state){
    const hp=state.players[localIndex].hp;if(lastHealth!=null&&hp<lastHealth){renderer.hit();sound.tone(90,.14,'sawtooth',.035)}lastHealth=hp;
    state.players.forEach((p,i)=>{if(p.shots>lastShots[i])sound.tone(i===localIndex?520:320,.055,'square',.012);lastShots[i]=p.shots});
    if(now-lastHud>100){hud();lastHud=now}
  }
  renderer.draw(state,localIndex,{...readInput(false),jx:touch.jx,jy:touch.jy});requestAnimationFrame(frame);
}
wallet();
const inviteCode=new URL(location.href).searchParams.get('room')?.toUpperCase();
if(!save.name)welcome();else if(validCode(inviteCode)){friends();$('room-code').value=inviteCode}else home();
requestAnimationFrame(frame);
