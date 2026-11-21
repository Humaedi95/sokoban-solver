// Sokoban solver for make.fun's sokoban-solver-01-run-20261121.
//
// Idea: the level is a one-wide hallway with one to four rooms off it. A box
// pushed into the hallway can never come back, so every box stays in its own
// room and the rooms are independent: the level's push-optimal count is the
// sum of the rooms' optima. Each room is solved optimally with a push-based
// A* (the player's exact square is abstracted away to its reachable region),
// and the room solutions are joined by plain hallway walks. Walk moves are
// free -- only pushes are scored -- so the order of the rooms does not matter.
//
// The A* uses an admissible heuristic (minimum-cost assignment of boxes to
// goals by empty-room distances), static dead-square pruning, 2x2-block
// pruning, and a transposition table. Everything is budgeted by work (node
// counts), never by the clock, so two runs write byte-identical outputs.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Directions: 0 up, 1 down, 2 left, 3 right.
const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];
const CH = ['u', 'd', 'l', 'r'];
const OPP = [1, 0, 3, 2];
const INF = 1e9;

// Deterministic work budgets (expansion counts, never the clock).
const ROOM_EXPANSION_CAP = 400000;
const WHOLE_EXPANSION_CAP = 300000;

// ---------------------------------------------------------------- level ----

interface Level {
  w: number;
  h: number;
  floor: Uint8Array;
  goal: Uint8Array;
  box: Uint8Array;
  player: number;
}

function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const floor = new Uint8Array(w * h);
  const goal = new Uint8Array(w * h);
  const box = new Uint8Array(w * h);
  let player = -1;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = x < row.length ? row[x] : '#';
      const i = y * w + x;
      if (ch === '#') continue;
      floor[i] = 1;
      if (ch === '.' || ch === '*' || ch === '+') goal[i] = 1;
      if (ch === '$' || ch === '*') box[i] = 1;
      if (ch === '@' || ch === '+') player = i;
    }
  }
  return { w, h, floor, goal, box, player };
}

// ------------------------------------------------------------ BFS helpers ----

/** Shortest walk from `from` to `to` as a move string, or null. Boxes in
 *  `blocked` are walls. Neighbours are tried in fixed u, d, l, r order. */
function bfsWalk(from: number, to: number, walk: Uint8Array, blocked: Uint8Array, w: number, h: number): string | null {
  if (from === to) return '';
  const prev = new Int32Array(w * h).fill(-1);
  const prevDir = new Int8Array(w * h).fill(-1);
  const q: number[] = [from];
  prev[from] = from;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi];
    const x = c % w;
    const y = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (!walk[n] || blocked[n] || prev[n] !== -1) continue;
      prev[n] = c;
      prevDir[n] = d;
      if (n === to) {
        let s = '';
        let cur = n;
        while (cur !== from) {
          s = CH[prevDir[cur]] + s;
          cur = prev[cur];
        }
        return s;
      }
      q.push(n);
    }
  }
  return null;
}

// ----------------------------------------------------------------- rooms ----

interface Room {
  cells: number[]; // global floor cells of the room
  boxes: number[]; // global cells
  goals: number[]; // global cells
  door: number; // global cell: the room cell touching the hallway
  entry: number; // global cell: the hallway cell touching the door
}

/** Split the level into the hallway row (the player's row) and the rooms
 *  off it. Returns null when the shape is not the expected one. */
function detectRooms(level: Level): Room[] | null {
  const { w, h, floor, player } = level;
  const hallRow = (player / w) | 0;
  const seen = new Uint8Array(w * h);
  const rooms: Room[] = [];
  for (let i = 0; i < w * h; i++) {
    if (!floor[i] || seen[i]) continue;
    if (((i / w) | 0) === hallRow) continue;
    const comp: number[] = [];
    const q = [i];
    seen[i] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      comp.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (!floor[n] || seen[n] || ((n / w) | 0) === hallRow) continue;
        seen[n] = 1;
        q.push(n);
      }
    }
    let door = -1;
    let entry = -1;
    for (const c of comp) {
      const x = c % w;
      const y = (c / w) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (((n / w) | 0) === hallRow && floor[n]) {
          door = c;
          entry = n;
          break;
        }
      }
      if (door !== -1) break;
    }
    if (door === -1) return null;
    const boxes = comp.filter((c) => level.box[c] === 1);
    const goals = comp.filter((c) => level.goal[c] === 1);
    rooms.push({ cells: comp, boxes, goals, door, entry });
  }
  return rooms;
}

// ---------------------------------------------------------------- search ----

interface Search {
  m: number; // box cells, local 0..m-1
  n: number; // all local cells (box cells + player-only cells)
  globalOf: number[]; // local -> global cell
  nbr: Int32Array; // n*4, local neighbour or -1
  goalMask: bigint;
  deadMask: bigint;
  dist: number[][]; // m x m, empty-room box distances, INF when unreachable
  goalCells: number[]; // local goal cells
  doorLocal: number; // -1 when there is no door
  sqMasks: bigint[]; // 2x2 squares: mask of their box cells
  startBox: bigint;
  startPlayer: number; // local
}

/**
 * Build a push search over `boxCells` (cells a box may occupy) with the
 * player also allowed on `playerExtra` cells (e.g. the hallway cell outside
 * a room's door). `doorGlobal` is the door cell, or -1 for no door.
 */
function buildSearch(
  level: Level,
  boxCellsGlobal: number[],
  playerExtraGlobal: number[],
  startPlayerGlobal: number,
  boxesGlobal: number[],
  goalsGlobal: number[],
  doorGlobal: number,
): Search {
  const { w, h } = level;
  const sorted = [...boxCellsGlobal].sort((a, b) => a - b);
  const m = sorted.length;
  const globalOf = [...sorted, ...playerExtraGlobal];
  const n = globalOf.length;
  const localOf = new Int32Array(w * h).fill(-1);
  globalOf.forEach((g, li) => {
    localOf[g] = li;
  });
  const nbr = new Int32Array(n * 4).fill(-1);
  for (let li = 0; li < n; li++) {
    const g = globalOf[li];
    const x = g % w;
    const y = (g / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      nbr[li * 4 + d] = localOf[ny * w + nx];
    }
  }
  let goalMask = 0n;
  const goalCells: number[] = [];
  for (const g of goalsGlobal) {
    const li = localOf[g];
    if (li === -1 || li >= m) throw new Error('goal outside box cells');
    goalMask |= 1n << BigInt(li);
    goalCells.push(li);
  }
  // Dead squares: reverse push reachability from the goals, ignoring other
  // boxes. A box on a cell outside this set can never reach a goal.
  const reach = new Uint8Array(m);
  const rq: number[] = [];
  for (const g of goalCells) {
    reach[g] = 1;
    rq.push(g);
  }
  for (let qi = 0; qi < rq.length; qi++) {
    const y = rq[qi];
    for (let d = 0; d < 4; d++) {
      const x = nbr[y * 4 + OPP[d]];
      if (x === -1 || x >= m) continue; // the box's previous cell
      const behind = nbr[x * 4 + OPP[d]];
      if (behind === -1) continue; // where the player stood
      if (!reach[x]) {
        reach[x] = 1;
        rq.push(x);
      }
    }
  }
  let deadMask = 0n;
  for (let i = 0; i < m; i++) if (!reach[i]) deadMask |= 1n << BigInt(i);
  // Empty-room box distances between box cells.
  const dist: number[][] = [];
  for (let a = 0; a < m; a++) {
    const row = new Array<number>(m).fill(INF);
    const dq = [a];
    row[a] = 0;
    for (let qi = 0; qi < dq.length; qi++) {
      const c = dq[qi];
      for (let d = 0; d < 4; d++) {
        const nb = nbr[c * 4 + d];
        if (nb === -1 || nb >= m) continue;
        if (row[nb] !== INF) continue;
        row[nb] = row[c] + 1;
        dq.push(nb);
      }
    }
    dist.push(row);
  }
  // 2x2 squares: masks of their box cells (other cells count as walls).
  const sqSet = new Set<bigint>();
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      let sq = 0n;
      for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
        const li = localOf[cy * w + cx];
        if (li !== -1 && li < m) sq |= 1n << BigInt(li);
      }
      if (sq !== 0n) sqSet.add(sq);
    }
  }
  let startBox = 0n;
  for (const g of boxesGlobal) startBox |= 1n << BigInt(localOf[g]);
  const startPlayer = localOf[startPlayerGlobal];
  const doorLocal = doorGlobal === -1 ? -1 : localOf[doorGlobal];
  return { m, n, globalOf, nbr, goalMask, deadMask, dist, goalCells, doorLocal, sqMasks: [...sqSet], startBox, startPlayer };
}

/** The player's reachable region from `from`, as a bitmask over local
 *  cells, with `box` cells blocked. */
function regionMask(s: Search, box: bigint, from: number): bigint {
  let mask = 0n;
  const stack = [from];
  mask |= 1n << BigInt(from);
  while (stack.length) {
    const c = stack.pop() as number;
    for (let d = 0; d < 4; d++) {
      const nb = s.nbr[c * 4 + d];
      if (nb === -1) continue;
      if (((mask >> BigInt(nb)) & 1n) === 1n) continue;
      if (nb < s.m && ((box >> BigInt(nb)) & 1n) === 1n) continue;
      mask |= 1n << BigInt(nb);
      stack.push(nb);
    }
  }
  return mask;
}

/** Lowest set bit of a mask: the canonical player position. */
function repOf(mask: bigint): number {
  let i = 0;
  while (((mask >> BigInt(i)) & 1n) === 0n) i++;
  return i;
}

/** Minimum-cost assignment of boxes to goals (exact for few boxes, a
 *  per-box nearest-goal sum otherwise). Admissible in both cases. */
function heuristic(s: Search, box: bigint, cache: Map<bigint, number>): number {
  const cached = cache.get(box);
  if (cached !== undefined) return cached;
  const boxes: number[] = [];
  for (let i = 0; i < s.m; i++) if (((box >> BigInt(i)) & 1n) === 1n) boxes.push(i);
  const goals = s.goalCells;
  const nb = boxes.length;
  let best = INF;
  if (nb <= 4) {
    const used = new Uint8Array(nb);
    const dfs = (i: number, cost: number): void => {
      if (cost >= best) return;
      if (i === nb) {
        best = cost;
        return;
      }
      for (let j = 0; j < nb; j++) {
        if (used[j]) continue;
        const d = s.dist[boxes[i]][goals[j]];
        if (d >= INF) continue;
        used[j] = 1;
        dfs(i + 1, cost + d);
        used[j] = 0;
      }
    };
    dfs(0, 0);
  } else {
    let sum = 0;
    for (const b of boxes) {
      let mn = INF;
      for (const g of goals) mn = Math.min(mn, s.dist[b][g]);
      if (mn >= INF) {
        sum = INF;
        break;
      }
      sum += mn;
    }
    best = sum;
  }
  cache.set(box, best);
  return best;
}

interface SNode {
  key: bigint;
  box: bigint;
  rep: number;
  g: number;
  h: number;
  parent: SNode | null;
  pb: number;
  pd: number;
  c: number;
}

function heapLess(a: SNode, b: SNode): boolean {
  const fa = a.g + a.h;
  const fb = b.g + b.h;
  if (fa !== fb) return fa < fb;
  if (a.h !== b.h) return a.h < b.h;
  return a.c < b.c;
}

function heapPush(heap: SNode[], node: SNode): void {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!heapLess(heap[i], heap[p])) break;
    const t = heap[i];
    heap[i] = heap[p];
    heap[p] = t;
    i = p;
  }
}

function heapPop(heap: SNode[]): SNode {
  const top = heap[0];
  const last = heap.pop() as SNode;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heapLess(heap[l], heap[m])) m = l;
      if (r < heap.length && heapLess(heap[r], heap[m])) m = r;
      if (m === i) break;
      const t = heap[i];
      heap[i] = heap[m];
      heap[m] = t;
      i = m;
    }
  }
  return top;
}

/** Can the player leave the room from this state: the door cell is free of
 *  boxes and reachable. */
function exitOk(s: Search, node: SNode): boolean {
  if (s.doorLocal === -1) return true;
  if (((node.box >> BigInt(s.doorLocal)) & 1n) === 1n) return false;
  const region = regionMask(s, node.box, node.rep);
  return ((region >> BigInt(s.doorLocal)) & 1n) === 1n;
}

/** A* over pushes. Returns the goal node, or null when the cap is hit or
 *  the search is exhausted. */
function astar(s: Search, requireExit: boolean, cap: number): SNode | null {
  const hCache = new Map<bigint, number>();
  const bestG = new Map<bigint, number>();
  const heap: SNode[] = [];
  let counter = 0;
  let expansions = 0;
  const startRep = repOf(regionMask(s, s.startBox, s.startPlayer));
  const h0 = heuristic(s, s.startBox, hCache);
  if (h0 >= INF) return null;
  const start: SNode = {
    key: s.startBox * 64n + BigInt(startRep),
    box: s.startBox,
    rep: startRep,
    g: 0,
    h: h0,
    parent: null,
    pb: -1,
    pd: -1,
    c: counter++,
  };
  bestG.set(start.key, 0);
  heapPush(heap, start);
  while (heap.length) {
    const node = heapPop(heap);
    if (node.g > (bestG.get(node.key) ?? INF)) continue;
    const isGoal = (node.box & ~s.goalMask) === 0n;
    if (isGoal && (!requireExit || exitOk(s, node))) return node;
    if (expansions >= cap) return null;
    expansions++;
    const region = regionMask(s, node.box, node.rep);
    for (let b = 0; b < s.m; b++) {
      if (((node.box >> BigInt(b)) & 1n) === 0n) continue;
      for (let d = 0; d < 4; d++) {
        const stance = s.nbr[b * 4 + OPP[d]];
        if (stance === -1) continue;
        if (((region >> BigInt(stance)) & 1n) === 0n) continue;
        const dest = s.nbr[b * 4 + d];
        if (dest === -1 || dest >= s.m) continue; // the box stays in its cells
        if (((node.box >> BigInt(dest)) & 1n) === 1n) continue;
        const nbox = node.box ^ (1n << BigInt(b)) ^ (1n << BigInt(dest));
        if ((nbox & s.deadMask) !== 0n) continue;
        let frozen = false;
        for (const sq of s.sqMasks) {
          if ((nbox & sq) === sq && (nbox & sq & ~s.goalMask) !== 0n) {
            frozen = true;
            break;
          }
        }
        if (frozen) continue;
        const h = heuristic(s, nbox, hCache);
        if (h >= INF) continue;
        const ng = node.g + 1;
        const nrep = repOf(regionMask(s, nbox, b));
        const nkey = nbox * 64n + BigInt(nrep);
        if (ng >= (bestG.get(nkey) ?? INF)) continue;
        bestG.set(nkey, ng);
        heapPush(heap, { key: nkey, box: nbox, rep: nrep, g: ng, h, parent: node, pb: b, pd: d, c: counter++ });
      }
    }
  }
  return null;
}

/** Turn a goal node into the move string, walking the player between
 *  pushes. `walk` marks the cells the player may step on. */
function reconstruct(
  s: Search,
  level: Level,
  walk: Uint8Array,
  startPlayerGlobal: number,
  boxesGlobal: number[],
  goalNode: SNode,
): { moves: string; endPlayer: number; pushes: number } {
  const pushes: { b: number; d: number }[] = [];
  let n: SNode | null = goalNode;
  while (n && n.parent) {
    pushes.push({ b: n.pb, d: n.pd });
    n = n.parent;
  }
  pushes.reverse();
  const blocked = new Uint8Array(level.w * level.h);
  for (const b of boxesGlobal) blocked[b] = 1;
  let player = startPlayerGlobal;
  let moves = '';
  for (const p of pushes) {
    const boxGlobal = s.globalOf[p.b];
    const stance = boxGlobal - (DY[p.d] * level.w + DX[p.d]);
    const w = bfsWalk(player, stance, walk, blocked, level.w, level.h);
    if (w === null) throw new Error('reconstruction walk failed');
    moves += w;
    moves += CH[p.d];
    blocked[boxGlobal] = 0;
    blocked[boxGlobal + (DY[p.d] * level.w + DX[p.d])] = 1;
    player = boxGlobal;
  }
  return { moves, endPlayer: player, pushes: pushes.length };
}

// ------------------------------------------------------------- level solve ----

interface RoomSolution {
  moves: string;
  endPlayer: number;
  pushes: number;
}

function solveRoom(
  level: Level,
  room: Room,
  requireExit: boolean,
  cap: number,
): RoomSolution | null {
  const s = buildSearch(level, room.cells, [room.entry], room.entry, room.boxes, room.goals, room.door);
  const node = astar(s, requireExit, cap);
  if (!node) return null;
  const walk = new Uint8Array(level.w * level.h);
  for (const c of room.cells) walk[c] = 1;
  walk[room.entry] = 1;
  return reconstruct(s, level, walk, room.entry, room.boxes, node);
}

function solveByRooms(level: Level, rooms: Room[]): string | null {
  const work: { room: Room; sol: RoomSolution; unconstrained: boolean }[] = [];
  let coveredBoxes = 0;
  for (const room of rooms) {
    if (room.boxes.length === 0) {
      if (room.goals.length > 0) return null; // goals no box can reach
      continue;
    }
    if (room.boxes.length !== room.goals.length) return null;
    coveredBoxes += room.boxes.length;
    let sol = solveRoom(level, room, true, ROOM_EXPANSION_CAP);
    let unconstrained = false;
    if (!sol) {
      sol = solveRoom(level, room, false, ROOM_EXPANSION_CAP);
      unconstrained = true;
    }
    if (!sol) return null;
    work.push({ room, sol, unconstrained });
  }
  let totalBoxes = 0;
  for (let i = 0; i < level.w * level.h; i++) if (level.box[i]) totalBoxes++;
  if (coveredBoxes !== totalBoxes) return null; // some box sits outside every room
  // Rooms solved without the exit condition must go last: the player does
  // not need to leave the final room.
  work.sort((a, b) =>
    a.unconstrained === b.unconstrained ? a.room.door - b.room.door : a.unconstrained ? 1 : -1,
  );
  const blocked = new Uint8Array(level.w * level.h);
  for (let i = 0; i < blocked.length; i++) if (level.box[i]) blocked[i] = 1;
  let player = level.player;
  let moves = '';
  for (const { room, sol } of work) {
    const w = bfsWalk(player, room.entry, level.floor, blocked, level.w, level.h);
    if (w === null) return null;
    moves += w;
    moves += sol.moves;
    player = sol.endPlayer;
    for (const b of room.boxes) blocked[b] = 0;
    for (const g of room.goals) blocked[g] = 1;
  }
  return moves;
}

function solveWhole(level: Level): string | null {
  const allFloor: number[] = [];
  const boxes: number[] = [];
  const goals: number[] = [];
  for (let i = 0; i < level.w * level.h; i++) {
    if (!level.floor[i]) continue;
    allFloor.push(i);
    if (level.box[i]) boxes.push(i);
    if (level.goal[i]) goals.push(i);
  }
  if (boxes.length !== goals.length) return null;
  const s = buildSearch(level, allFloor, [], level.player, boxes, goals, -1);
  const node = astar(s, false, WHOLE_EXPANSION_CAP);
  if (!node) return null;
  return reconstruct(s, level, level.floor, level.player, boxes, node).moves;
}

function solveLevel(level: Level): string {
  const rooms = detectRooms(level);
  if (rooms && rooms.length > 0) {
    const byRooms = solveByRooms(level, rooms);
    if (byRooms !== null) return byRooms;
  }
  return solveWhole(level) ?? '';
}

// -------------------------------------------------------------------- main ----

for (const id of readdirSync(I).sort()) {
  const level = parseLevel(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  const moves = solveLevel(level);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
