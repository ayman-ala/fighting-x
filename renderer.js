import { ARENA, FIGHTERS, clamp } from './core.js';
let ctx;
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.flashUntil = 0;
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
    this.scale = r.height / 600; this.height = 600; this.width = r.width / this.scale;
    this.joy = { x: 72, y: 600 - 88, r: 45 };
    this.fire = { x: this.width - 72, y: 600 - 88, r: 42 };
  }
  point(event) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (event.clientX-r.left)/this.scale, y: (event.clientY-r.top)/this.scale };
  }
  hit() { this.flashUntil = performance.now() + 120; }
  draw(state, index, controls = {}) {
    ctx = this.ctx; const W = this.width, H = this.height, ratio = this.dpr * this.scale;
    const project = p => index ? { x: ARENA.width-p.x, y: ARENA.height-p.y } : p;
    const me = state ? project(state.players[index]) : { x: ARENA.width/2, y: ARENA.height/2 };
    const cx = W > ARENA.width ? (ARENA.width-W)/2 : clamp(me.x-W/2,0,ARENA.width-W);
    const cy = clamp(me.y-H*.59,0,ARENA.height-H);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle = performance.now() < this.flashUntil ? '#31162b' : '#080e1c'; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.translate(-cx,-cy);
    ctx.strokeStyle = '#5ef2ff0c'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= ARENA.width; x += 100) { ctx.moveTo(x,0); ctx.lineTo(x,ARENA.height); }
    for (let y = 0; y <= ARENA.height; y += 100) { ctx.moveTo(0,y); ctx.lineTo(ARENA.width,y); }
    ctx.stroke(); ctx.strokeStyle = '#5ef2ff70'; ctx.lineWidth = 3; ctx.strokeRect(0,0,ARENA.width,ARENA.height);
    if (!state) { ctx.restore(); return; }
    const goo = state.goo;
    if (goo > 0) {
      ctx.fillStyle = '#2878ff65';
      ctx.fillRect(0,0,ARENA.width,goo);ctx.fillRect(0,ARENA.height-goo,ARENA.width,goo);
      ctx.fillRect(0,goo,goo,ARENA.height-2*goo);ctx.fillRect(ARENA.width-goo,goo,goo,ARENA.height-2*goo);
      ctx.strokeStyle = '#8cc8ffe0';ctx.lineWidth = 3;ctx.strokeRect(goo,goo,ARENA.width-2*goo,ARENA.height-2*goo);
    }
    for (const b of state.bullets) {
      const p=project(b);ctx.fillStyle=b.owner===index?'#5ef2ff':'#ff6a88';ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;
      ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    for (let i=0;i<2;i++) {
      const player=state.players[i],p=project(player);
      ship(p.x,p.y,i===index?1:-1,i===index?'#c8f24a':'#ff9ab0',i===index?'#9dff00':'#ff4d6d',player.name,player.fighter);
    }
    if (controls.fire && controls.ax != null) {
      ctx.strokeStyle='#ff6a8880';ctx.lineWidth=2;ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(me.x,me.y);
      ctx.lineTo(me.x+controls.ax*300,me.y+controls.ay*300);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.restore();
    const enemy=project(state.players[1-index]),ex=enemy.x-cx,ey=enemy.y-cy;
    if (ex < 20 || ex > W-20 || ey < 80 || ey > H-80) {
      const dx=ex-W/2,dy=ey-H/2, factor=Math.min((W/2-30)/Math.max(1,Math.abs(dx)),(H/2-100)/Math.max(1,Math.abs(dy)));
      const x=W/2+dx*factor,y=H/2+dy*factor;
      ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));ctx.fillStyle='#ff6a88';ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-6);ctx.lineTo(-5,6);ctx.closePath();ctx.fill();ctx.restore();
    }
    const mx=W-66,my=95,mw=48,mh=80;
    ctx.fillStyle='#0008';ctx.fillRect(mx,my,mw,mh);ctx.strokeStyle='#5ef2ff70';ctx.lineWidth=1;ctx.strokeRect(mx,my,mw,mh);
    if(goo>0){ctx.fillStyle='#2878ff65';ctx.fillRect(mx,my,mw,mh);ctx.fillStyle='#000a';ctx.fillRect(mx+goo/ARENA.width*mw,my+goo/ARENA.height*mh,mw*(1-2*goo/ARENA.width),mh*(1-2*goo/ARENA.height));}
    [0,1].forEach(i=>{const p=project(state.players[i]);ctx.fillStyle=i===index?'#5ef2ff':'#ff6a88';ctx.fillRect(mx+p.x/ARENA.width*mw-2,my+p.y/ARENA.height*mh-2,4,4)});
    const j=this.joy,f=this.fire;
    ctx.strokeStyle='#c4daff55';ctx.lineWidth=2;ctx.beginPath();ctx.arc(j.x,j.y,j.r,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#d9e6ff60';ctx.beginPath();ctx.arc(j.x+(controls.jx||0)*j.r,j.y+(controls.jy||0)*j.r,19,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=controls.fire?'#ff4769':'#e54464b0';ctx.shadowColor='#ff4769';ctx.shadowBlur=controls.fire?22:8;
    ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='white';ctx.font='800 12px sans-serif';ctx.textAlign='center';ctx.fillText('FIRE',f.x,f.y+4);
    if (state.phase==='countdown') {ctx.fillStyle='white';ctx.font='900 72px sans-serif';ctx.fillText(Math.max(1,Math.ceil(state.countdown)),W/2,H/2);ctx.font='700 12px sans-serif';ctx.fillStyle='#b6ff69';ctx.fillText('GET READY',W/2,H/2+32);}
  }
}
export function thumbnail(fighter) {
  const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;
  ctx=canvas.getContext('2d');ctx.translate(48,78);ctx.scale(1.45,1.45);
  ship(0,0,1,'#c8f24a',FIGHTERS[fighter].color,'',fighter);
  return canvas.toDataURL('image/png');
}
function bumbo(x,y,mine,name){
  const g=mine?'#4dff7a':'#ff4d6d';
  ctx.save();ctx.translate(x,y);ctx.shadowColor=g;ctx.shadowBlur=14;ctx.fillStyle='#4ade80';
  ctx.beginPath();ctx.arc(-11,-22,6,0,7);ctx.fill();ctx.beginPath();ctx.arc(11,-22,6,0,7);ctx.fill();
  ctx.beginPath();ctx.ellipse(0,0,17,22,0,0,7);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#10301a';ctx.beginPath();ctx.arc(-6,-8,2.6,0,7);ctx.fill();ctx.beginPath();ctx.arc(6,-8,2.6,0,7);ctx.fill();
  ctx.strokeStyle='#10301a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-3,6,.2,2.9);ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.globalAlpha=.85;ctx.fillText(name,x,y-34);ctx.globalAlpha=1;
}
function swirl(x,y,mine,name){
  const g=mine?'#3da9ff':'#ff4d6d';
  ctx.save();ctx.translate(x,y);ctx.shadowColor=g;ctx.shadowBlur=14;
  ctx.fillStyle='#8a63d2';ctx.beginPath();ctx.ellipse(0,-4,16,23,0,0,7);ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='#ff4fb8';ctx.beginPath();ctx.ellipse(0,-22,12,8,0,0,7);ctx.fill();ctx.fillRect(-13,3,26,3);
  ctx.fillStyle='#ffe033';ctx.fillRect(-11,13,22,14);
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-6.5,-11,6.5,0,7);ctx.fill();ctx.beginPath();ctx.arc(6.5,-9,6.5,0,7);ctx.fill();
  ctx.fillStyle='#1a1a22';ctx.beginPath();ctx.arc(-6,-10,3.4,0,7);ctx.fill();ctx.beginPath();ctx.arc(6,-8,3.4,0,7);ctx.fill();
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.globalAlpha=.85;ctx.fillText(name,x,y-36);ctx.globalAlpha=1;
}
function monster(x,y,mine,name){
  const g=mine?'#ff9a3c':'#ff3b3b';
  ctx.save();ctx.translate(x,y);ctx.shadowColor=g;ctx.shadowBlur=14;
  ctx.fillStyle='#3a1a14';ctx.beginPath();ctx.moveTo(-11,-4);ctx.lineTo(11,-4);ctx.lineTo(21,28);ctx.lineTo(-21,28);ctx.closePath();ctx.fill();
  ctx.fillStyle='#2a1210';ctx.beginPath();ctx.ellipse(0,-5,23,10,0,0,7);ctx.fill();
  ctx.fillStyle='#7a3a28';ctx.beginPath();ctx.moveTo(-9,-28);ctx.lineTo(-13,-45);ctx.lineTo(-3,-31);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(9,-28);ctx.lineTo(13,-45);ctx.lineTo(3,-31);ctx.closePath();ctx.fill();
  ctx.fillStyle='#b3613f';ctx.beginPath();ctx.ellipse(0,-16,15,17,0,0,7);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#1a0806';ctx.fillRect(-11,-9,22,6);
  ctx.fillStyle='#f3e9d2';
  for(let i=-4;i<=4;i++){const t=i*2.5;ctx.beginPath();ctx.moveTo(t-1.3,-9);ctx.lineTo(t,-5.2);ctx.lineTo(t+1.3,-9);ctx.fill();ctx.beginPath();ctx.moveTo(t-1.3,-3);ctx.lineTo(t,-6.8);ctx.lineTo(t+1.3,-3);ctx.fill()}
  ctx.shadowColor='#ffb347';ctx.shadowBlur=10;ctx.fillStyle='#ffb347';
  ctx.beginPath();ctx.arc(-6,-19,3.4,0,7);ctx.fill();ctx.beginPath();ctx.arc(6,-19,3.4,0,7);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#3a0d00';ctx.beginPath();ctx.arc(-6,-19,1.2,0,7);ctx.fill();ctx.beginPath();ctx.arc(6,-19,1.2,0,7);ctx.fill();
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.globalAlpha=.85;ctx.fillText(name,x,y-50);ctx.globalAlpha=1;
}
function astro(x,y,mine,name){
  const g=mine?'#4cc3ff':'#ff4d6d';
  ctx.save();ctx.translate(x,y);ctx.shadowColor=g;ctx.shadowBlur=14;
  ctx.fillStyle='#eaf2ff';
  ctx.fillRect(-10,16,8,11);ctx.fillRect(2,16,8,11);ctx.fillRect(-12,-4,24,22);ctx.fillRect(-17,0,6,14);ctx.fillRect(11,0,6,14);
  ctx.beginPath();ctx.arc(0,-16,15,0,7);ctx.fill();
  ctx.fillStyle='#bfe3ff';ctx.fillRect(-21,-27,7,10);ctx.fillRect(14,-27,7,10);
  ctx.shadowBlur=0;
  ctx.fillStyle='#e8b923';ctx.fillRect(-17,-2,6,4);ctx.fillRect(-10,18,6,3);ctx.fillRect(4,18,6,3);
  ctx.fillStyle='#0b1f4a';ctx.beginPath();ctx.ellipse(0,-16,11,9,0,0,7);ctx.fill();
  ctx.fillStyle='rgba(120,200,255,.55)';ctx.beginPath();ctx.ellipse(-4,-19,4,2.5,-.5,0,7);ctx.fill();
  ctx.fillStyle=g;ctx.fillRect(-4,3,8,6);
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.globalAlpha=.85;ctx.fillText(name,x,y-34);ctx.globalAlpha=1;
}
function ship(x,y,dir,body,frill,name,ch){
  if(ch===1)return astro(x,y,dir>0,name);if(ch===2)return monster(x,y,dir>0,name);if(ch===3)return swirl(x,y,dir>0,name);if(ch===4)return bumbo(x,y,dir>0,name);
  ctx.save();ctx.translate(x,y);ctx.scale(1,dir);ctx.shadowColor=frill;ctx.shadowBlur=12;
  ctx.fillStyle=frill;
  [-1,1].forEach(s=>{ctx.save();ctx.scale(s,1);ctx.fillRect(16,-26,6,12);ctx.fillRect(21,-22,7,8);ctx.fillRect(16,-13,11,5);ctx.fillRect(13,0,9,5);ctx.fillRect(13,10,9,5);ctx.restore()});
  ctx.fillStyle=body;
  ctx.fillRect(-12,-8,24,26);ctx.fillRect(-6,18,12,10);ctx.fillRect(-17,-24,34,18);
  ctx.shadowBlur=0;ctx.fillStyle='#10141c';ctx.fillRect(-13,-17,10,3);ctx.fillRect(3,-17,10,3);
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='700 9px sans-serif';ctx.textAlign='center';ctx.globalAlpha=.85;ctx.fillText(name,x,dir>0?y-32:y-38);ctx.globalAlpha=1;
}
