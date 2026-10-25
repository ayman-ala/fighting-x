export const ARENA = Object.freeze({ width: 1140, height: 1900 });
export const FIXED_STEP = 1 / 60;
export const NETWORK_INTERVAL = 50;
export const FIGHTERS = Object.freeze([
  { name: 'Aura', rarity: 'Legendary', color: '#ffd76b', spread: [-.45,-.22,0,.22,.45], damage: .62 },
  { name: 'Iglow', rarity: 'Epic', color: '#c98bff', spread: [-.2,0,.2], damage: .8 },
  { name: 'X726', rarity: 'Mythic', color: '#ff6a88', spread: [-.3,-.1,.1,.3], damage: .7 },
  { name: 'Swirl', rarity: 'Super rare', color: '#7cc4ff', spread: [-.12,.12], damage: 1 },
  { name: 'Bumbo', rarity: 'Rare+', color: '#8dffa9', spread: [0], damage: 1.5 },
]);
export const DIFFICULTIES = Object.freeze({
  easy: { label: 'Easy', speed: 155, interval: 1.15, error: .65, dodge: false },
  normal: { label: 'Normal', speed: 205, interval: .75, error: .28, dodge: true },
  hard: { label: 'Hard', speed: 235, interval: .52, error: .11, dodge: true },
});
export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
const integer = (v, max = 1e9) => clamp(Number.isFinite(Number(v)) ? Math.floor(Number(v)) : 0, 0, max);
export function normalizeSave(raw = {}) {
  if(!raw||typeof raw!=='object')raw={};
  const own = [...new Set([4, ...(Array.isArray(raw.own) ? raw.own.filter(n => Number.isInteger(n) && n >= 0 && n < 5) : [])])];
  const wins = Math.max(integer(raw.wins), Math.floor(integer(raw.tro, 500) / 10));
  return {
    version: 2, name: String(raw.name || '').trim().slice(0, 12),
    tro: integer(raw.tro, 500), coins: integer(raw.coins), crates: integer(raw.crates, 100000),
    lv: FIGHTERS.map((_, i) => integer(raw.lv?.[i], 10)), own,
    pick: own.includes(raw.pick) ? raw.pick : 4, wins,
    sound: raw.sound === true,
    difficulty: Object.hasOwn(DIFFICULTIES, raw.difficulty) ? raw.difficulty : 'easy',
    ts: integer(raw.ts, Number.MAX_SAFE_INTEGER),
  };
}
export function upgradeCost(level) { return 10 * (integer(level, 9) + 1) * (integer(level, 9) + 2); }
export function awardWin(save) {
  const previousTrophies=save.tro;
  save.wins++; save.tro = Math.min(500, save.tro + 10); save.coins += 20;
  const crate = save.wins % 5 === 0;
  if (crate) save.crates++;
  return { coins: 20, trophies: save.tro-previousTrophies, crate };
}
export function openReward(save, random = Math.random) {
  if (save.crates <= 0) return null;
  save.crates--;
  const locked = [3, 1, 2, 0].filter(i => !save.own.includes(i));
  if (locked.length) {
    const weights = [50, 25, 15, 10];
    let cursor = clamp(random(), 0, .999999) * locked.reduce((sum, id) => sum + weights[[3,1,2,0].indexOf(id)], 0);
    let fighter = locked[locked.length - 1];
    for (const id of locked) { cursor -= weights[[3,1,2,0].indexOf(id)]; if (cursor < 0) { fighter = id; break; } }
    save.own.push(fighter); return { fighter, isNew: true, coins: 0 };
  }
  save.coins += 100;
  return { fighter: integer(random() * 5, 4), isNew: false, coins: 100 };
}
export function normalizeInput(raw = {}) {
  if(!raw||typeof raw!=='object')raw={};
  let x = Number.isFinite(raw.x) ? clamp(raw.x, -1, 1) : 0;
  let y = Number.isFinite(raw.y) ? clamp(raw.y, -1, 1) : 0;
  const magnitude = Math.hypot(x, y); if (magnitude > 1) { x /= magnitude; y /= magnitude; }
  let ax = Number.isFinite(raw.ax) ? clamp(raw.ax, -1, 1) : null;
  let ay = Number.isFinite(raw.ay) ? clamp(raw.ay, -1, 1) : null;
  const aimLength = Math.hypot(ax || 0, ay || 0);
  if (ax == null || ay == null || aimLength < .1) { ax = ay = null; }
  else { ax /= aimLength; ay /= aimLength; }
  return { x, y, ax, ay, fire: raw.fire === true };
}
function player(profile, index, friendly) {
  const fighter = Number.isInteger(profile.fighter) && profile.fighter >= 0 && profile.fighter < 5 ? profile.fighter : 4;
  const level = friendly ? 0 : integer(profile.level, 10);
  const maxHp = 5 * (1 + .25 * level);
  return { x: ARENA.width / 2, y: index ? 150 : ARENA.height - 150, fighter, level,
    name: String(profile.name || (index ? 'Rival' : 'You')).slice(0, 12), hp: maxHp, maxHp,
    cooldown: 0, gooCooldown: 0, shots: 0 };
}
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, d = dx * dx + dy * dy;
  const t = d ? clamp(((px - ax) * dx + (py - ay) * dy) / d, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
export class Match {
  constructor(profiles, { friendly = false, difficulty = 'easy', random = Math.random, round = 1 } = {}) {
    this.state = { round, phase: 'countdown', countdown: 3, elapsed: 0, goo: 0,
      winner: null, players: profiles.map((p, i) => player(p, i, friendly)), bullets: [], shotId: 0 };
    this.random = random; this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
    this.botCooldown = 0; this.botAim = 0;
  }
  botInput(dt) {
    const s = this.state, p = s.players[1], rival = s.players[0], config = this.difficulty;
    let dx = rival.x - p.x, dy = rival.y - p.y, distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance, uy = dy / distance, strafe = Math.sin(s.elapsed * 1.3) > 0 ? 1 : -1;
    let x = -uy * strafe * .65, y = ux * strafe * .65;
    if (distance > 480) { x += ux; y += uy; }
    if (distance < 320) { x -= ux; y -= uy; }
    if (config.dodge) for (const b of s.bullets) {
      if (b.owner !== 0) continue;
      const rx = p.x - b.x, ry = p.y - b.y, speed = Math.hypot(b.vx, b.vy);
      const along = (rx * b.vx + ry * b.vy) / speed, perpendicular = (rx * b.vy - ry * b.vx) / speed;
      if (along > 0 && along < 190 && Math.abs(perpendicular) < 45) {
        const side = perpendicular >= 0 ? -1 : 1; x = -b.vy / speed * side; y = b.vx / speed * side; break;
      }
    }
    const margin = s.goo + 60;
    if (p.x < margin) x = 1; if (p.x > ARENA.width - margin) x = -1;
    if (p.y < margin) y = 1; if (p.y > ARENA.height - margin) y = -1;
    this.botCooldown -= dt;
    const fire = distance < 730 && this.botCooldown <= 0;
    if (fire) { this.botCooldown = config.interval; this.botAim = (this.random() - .5) * config.error; }
    const c = Math.cos(this.botAim), sn = Math.sin(this.botAim);
    return { ...normalizeInput({ x, y, fire, ax: ux * c - uy * sn, ay: ux * sn + uy * c }), speed: config.speed };
  }
  step(dt, inputs, bot = false) {
    const s = this.state; if (s.phase === 'over') return;
    if (s.phase === 'countdown') { s.countdown = Math.max(0, s.countdown - dt); if (s.countdown === 0) s.phase = 'play'; return; }
    s.elapsed += dt;
    s.goo = Math.min(ARENA.width / 2, s.elapsed * 10);
    const normalized = inputs.map(normalizeInput);
    if (bot) normalized[1] = this.botInput(dt);
    for (let index = 0; index < 2; index++) {
      const p = s.players[index], other = s.players[1 - index], input = normalized[index];
      p.x = clamp(p.x + input.x * (input.speed || 230) * dt, 20, ARENA.width - 20);
      p.y = clamp(p.y + input.y * (input.speed || 230) * dt, 26, ARENA.height - 26);
      p.cooldown -= dt; p.gooCooldown -= dt;
      if (p.x - 16 < s.goo || p.x + 16 > ARENA.width - s.goo || p.y - 16 < s.goo || p.y + 16 > ARENA.height - s.goo) {
        if (p.gooCooldown <= 0) { p.hp -= 1; p.gooCooldown = 1; }
      } else p.gooCooldown = 0;
      if (input.fire && p.cooldown <= 0) {
        p.cooldown = .42; p.shots++;
        let ax = input.ax ?? other.x - p.x, ay = input.ay ?? other.y - p.y;
        const length = Math.hypot(ax, ay) || 1; ax /= length; ay /= length;
        for (const angle of FIGHTERS[p.fighter].spread) {
          const c = Math.cos(angle), sn = Math.sin(angle);
          s.bullets.push({ id: ++s.shotId, owner: index, x: p.x, y: p.y, vx: (ax*c-ay*sn)*360,
            vy: (ax*sn+ay*c)*360, distance: 0, damage: FIGHTERS[p.fighter].damage * (1+.25*p.level) });
        }
      }
    }
    s.bullets = s.bullets.filter(b => {
      const oldX = b.x, oldY = b.y; b.x += b.vx*dt; b.y += b.vy*dt; b.distance += 360*dt;
      const target = s.players[1-b.owner];
      if (segmentDistance(target.x,target.y,oldX,oldY,b.x,b.y) < 21) { target.hp -= b.damage; return false; }
      return b.distance < 760 && b.x > 0 && b.x < ARENA.width && b.y > 0 && b.y < ARENA.height;
    });
    const dead = s.players.map(p => p.hp <= 0);
    if (dead.some(Boolean)) { s.phase = 'over'; s.winner = dead[0] && dead[1] ? -1 : dead[0] ? 1 : 0; }
  }
}

// Reject malformed network snapshots before they reach the renderer or result UI.
export function validSnapshot(s) {
  if (!s || !['countdown','play','over'].includes(s.phase) || !Number.isInteger(s.round) || s.round < 1 ||
      !Number.isFinite(s.elapsed) || !Number.isFinite(s.countdown) || !Number.isFinite(s.goo) ||
      !Array.isArray(s.players) || s.players.length !== 2 || !Array.isArray(s.bullets) || s.bullets.length > 100) return false;
  if (s.phase === 'over' && ![-1,0,1].includes(s.winner)) return false;
  return s.players.every(p => p && ['x','y','hp','maxHp'].every(k => Number.isFinite(p[k])) &&
    Number.isInteger(p.fighter) && p.fighter >= 0 && p.fighter < 5 && typeof p.name === 'string' && p.name.length <= 12 &&
    p.x >= 0 && p.x <= ARENA.width && p.y >= 0 && p.y <= ARENA.height && p.maxHp > 0 && p.maxHp <= 17.5) &&
    s.bullets.every(b => b && [0,1].includes(b.owner) && ['x','y','vx','vy'].every(k => Number.isFinite(b[k])));
}
