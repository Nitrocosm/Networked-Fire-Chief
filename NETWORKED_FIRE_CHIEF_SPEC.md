# Networked Fire Chief (Reimplementation) — Build Specification

**Version:** 1.0
**Target tooling:** Claude Code
**Status:** Complete — no open design questions

---

## 1. Overview

A real-time, multiplayer-first firefighting simulation game inspired by **Networked Fire Chief** (Omodei & Wearing, La Trobe University), a research microworld for studying teamwork and dynamic decision-making under load.

Players collectively operate firefighting appliances to **contain** wildfires across a hex-grid landscape for a fixed time limit. The game is **loss-only**: the team starts at a fixed score (100,000) and bleeds points as land and assets burn. The goal is to finish the round having lost as little as possible. There is no "win by extinguishing everything" — the clock is the only terminator.

The core design tension is **information asymmetry across asymmetric roles**: three appliance types with different capabilities and different restricted views, such that no single operator has enough capability or information to succeed alone. Coordination *is* the game.

### Design pillars
1. **Loss-only scoring** drives loss-aversion and triage decisions.
2. **Asymmetric roles + asymmetric information** force communication.
3. **Real-time** play under a countdown.
4. **Authoritative simulation** decoupled from rendering — multiplayer-ready from day one.
5. **Reproducibility**: scripted scenarios AND seeded procedural generation, both deterministic.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Cell** | One tile on the hex grid. Has a terrain type and a fire state. |
| **Operator** | A human player. Controls all units of one role (multiplayer) or all units (single-player). |
| **Appliance / Unit** | A controllable vehicle: helicopter, truck, or dozer. |
| **Role** | The appliance type an operator is assigned: Helicopter, Truck, or Dozer. |
| **Source** | A water or fuel cell that units refill from. Depletable. |
| **Warning** | A telegraph that a fire will ignite soon, near (not exactly at) a location. |
| **Developed fire** | An ignition that occurs after a warning's lead time elapses. |
| **Firebreak** | A cell cleared by the dozer; cannot catch or carry fire. |
| **Burnout** | The terminal state of a burning cell. Score is lost at this moment. |
| **Tick** | One discrete simulation step. |
| **Scenario** | A deterministic definition of a round: map seed + outbreak schedule + config. |

---

## 3. Architecture

### 3.1 Separation of concerns (critical)

```
┌─────────────────────────────────────────────┐
│  SIMULATION CORE  (pure TypeScript, no React)  │
│  - authoritative game state                    │
│  - deterministic tick(state, commands) → state │
│  - fire CA, wind, units, scoring, events       │
└───────────────┬───────────────────────────────┘
                │  commands in / snapshots out
┌───────────────┴───────────────────────────────┐
│  TRANSPORT LAYER  (swappable)                   │
│  - local: in-process (single-player / dev)      │
│  - remote: WebSocket client/server (multiplayer)│
└───────────────┬───────────────────────────────┘
┌───────────────┴───────────────────────────────┐
│  CLIENT  (React shell + Canvas renderer)        │
│  - renders snapshot, role-filtered             │
│  - captures input → emits commands             │
│  - per-role HUD                                │
└─────────────────────────────────────────────┘
```

The **simulation core must never import React** and must be fully deterministic: `tick(state, commandsThisTick, rngState) → newState`. Determinism (seeded RNG, fixed tick order) is what makes scenarios reproducible and what makes server-authoritative multiplayer possible.

### 3.2 Command / snapshot model

- Clients never mutate state directly. They emit **commands** (intentions).
- The sim applies queued commands at the start of each tick, advances the world, then emits a **snapshot**.
- Snapshots are **role-filtered** before reaching a client (the helicopter client literally never receives warning data; the dozer client never receives wind data). Filter server-side so clients can't cheat by reading hidden fields.

### 3.3 Recommended stack

- **Language:** TypeScript (strict).
- **Build:** Vite.
- **UI shell:** React.
- **Render:** HTML5 Canvas (2D), driven by `requestAnimationFrame`, reading the latest snapshot. Not React-rendered cells.
- **Client state:** Zustand (holds latest snapshot + local UI state).
- **Sim loop:** fixed-timestep accumulator, independent of render FPS.
- **Multiplayer (later):** WebSocket; authoritative server runs the same sim core module. Node server reuses `/sim` verbatim.
- **Single-player:** the same sim core runs in-browser via the local transport. **Single-player is "one operator controlling all 6 units"; multiplayer is "three operators, 2 units each."** Same core, different command routing + snapshot filtering.

---

## 4. The Grid

- **Dimensions:** 50 × 50 cells (configurable).
- **Topology:** **offset hex** — every other row is shifted half a cell horizontally, giving each cell **6 neighbors** (not 8). Use **axial or offset ("odd-r"/"even-r") coordinates**; pick one convention and document it. Neighbor lookup, pathfinding, and rendering all use the hex layout.
- **Rendering:** flat-top or pointy-top hexes (pointy-top pairs naturally with offset rows). Cell size configurable; 50×50 must fit a pannable/zoomable viewport.

### 4.1 Cell terrain types

| Type | Flammable | Notes |
|---|---|---|
| `GRASSLAND` | Yes | Fast ignition, low burn duration, low loss value. Initial fires only start here. Dozer may clear it. |
| `FOREST` | Yes | Slower ignition, longer burn duration, higher loss value. Dozer may clear it. |
| `WATER_SOURCE` | No | Refills a unit's **water**. Depletable (see §7). |
| `FUEL_SOURCE` | No | Refills a unit's **fuel**. Depletable. |
| `HOUSE` (asset) | Yes | High loss value. Clustered. Dozer may **not** clear. |
| `ANIMALS` (asset) | Yes | High loss value. Clustered. Dozer may **not** clear. |
| `FIREBREAK` | No | Created by dozer from grassland/forest. Cannot catch or carry fire. |
| `ROAD` *(optional)* | No | Non-flammable. Default no gameplay effect; optional `roadSpeedBonus` / `truckOnly` flags reserved. Off by default. |
| `BARE` *(optional)* | No | Non-flammable inert ground. Reserved for map variety. |

Assets (`HOUSE`, `ANIMALS`) are **multi-cell clusters of individual asset cells**, not special multi-cell objects. Each asset cell burns and is scored independently.

---

## 5. Fire Model

### 5.1 Cell fire states

```
UNBURNT → IGNITING → BURNING → BURNT_OUT
```

- `UNBURNT`: default for flammable cells.
- `IGNITING`: optional brief pre-burn state (visual ramp); may be folded into BURNING. Configurable.
- `BURNING`: actively burning; spreads fire to neighbors. Has a `burnTimer` counting down from the cell's burn duration.
- `BURNT_OUT`: terminal. **Does not spread. Cannot reignite.** Score is deducted at the transition into BURNT_OUT.

Only `BURNING` cells spread fire. A cell currently **being extinguished** does not spread while suppression is in progress (see §8).

### 5.2 Spread algorithm (per tick)

Grounded in the standard probabilistic-CA formulation (constant base probability modified by fuel and wind, with the number of burning neighbors as the dominant factor).

For each `UNBURNT` flammable cell `c` that has ≥1 `BURNING` neighbor:

```
P_ignite(c) = 1 − Π over each burning neighbor i of (1 − p_i)

where  p_i = p0 × fuelFactor(c) × windFactor(directionFrom(i → c))
```

- `p0` — base per-neighbor per-tick catch probability. Tune so that, over a cell's burn duration, ~4–5 of its 6 neighbors ignite. **Start `p0 ≈ 0.08` per tick and tune.**
- `fuelFactor(c)` — `GRASSLAND` higher (ignites readily), `FOREST` lower per-tick but longer burn. Assets ignite like the vegetation they sit in (tunable).
- `windFactor(dir)` — directional multiplier from the burning neighbor toward `c`:
  - Downwind: ≫ 1 (e.g. up to ~3–4× at full wind speed).
  - Crosswind: ~1.
  - Upwind: ≪ 1 (near 0 but **not** exactly 0 — rare upwind spread must be possible).
  - Scale the magnitude by current **wind speed**.

Roll once per eligible cell per tick using the **seeded RNG**. The "burning neighbors dominate" property emerges naturally from the product formula.

### 5.3 Burn duration

- Each cell has `burnDuration` by terrain (`FOREST` > `GRASSLAND`). On entering `BURNING`, set `burnTimer = burnDuration`. Decrement per tick; at 0 → `BURNT_OUT` and **deduct score**.

---

## 6. Wind

- **Global** wind: `direction` (one of 6 hex directions, or continuous angle mapped to hex) and `speed` (0–1 normalized, or named tiers).
- **Shifts over the round.** Driven by the scenario (scripted keyframes) or seeded procedural drift. Both deterministic.
- **Forecast:** the game exposes a near-future wind state (`forecastDirection`, `forecastSpeed`, `forecastEta`). Shown to Helicopter and Truck; **hidden from Dozer**.
- Wind is the dominant strategic variable: it determines `windFactor` in spread and thus where fire will travel.

---

## 7. Resources & Refilling

Each unit has **two independent resources**: `water` and `fuel`, each 0–100%.

- **Consumption is per action, not per movement.** Movement is free.
  - Helicopter: **−50% water and −50% fuel** per extinguish action.
  - Truck: **−25% water and −25% fuel** per extinguish action.
  - Dozer: **−25% water and −25% fuel** per firebreak action.
  - (So a heli gets 2 actions per full tank; truck/dozer get 4.)
- A unit cannot perform an action it can't afford (needs ≥ the cost in *both* resources). Surface this in the HUD.

### 7.1 Sources are depletable

- Each `WATER_SOURCE` / `FUEL_SOURCE` cell holds `100%` capacity = exactly one full unit-tank.
- Refilling draws from the source: a unit topping up by X% reduces the source by X%. **Partial refills leave the source proportionally depleted.**
- An emptied source is spent (shows visually as depleted).
- **Refill rate:** sitting on the source fills over **~1–2 seconds** (configurable `REFILL_DURATION`). Water and fuel are **separate cell types** → separate trips to refill each resource.
- **Regeneration:** `SOURCE_REGEN_RATE` config, **default 0 (off)** for faithful scarcity. If >0, sources slowly refill over the round.

---

## 8. Appliances (Units)

**3 roles × 2 units each = 6 units total** (`UNITS_PER_OPERATOR` configurable, default 2).

| | Helicopter | Truck | Dozer |
|---|---|---|---|
| Speed | ~2.5× truck | 1× | 1× |
| Action | Extinguish | Extinguish | Make firebreak |
| Cost / action | 50% water + 50% fuel | 25% + 25% | 25% + 25% |
| Terrain | Flies over all | All (terrain-cost optional) | All |
| Action targets | Any burning cell | Any burning cell | Grassland/Forest only — **never** house/animals |
| Can't see | **Fire warnings** | — | **Wind info (incl. forecast)** |
| Destructible by fire | No | No | No |

- **Extinguish:** brings any fire state → 0 over `EXTINGUISH_DURATION` (default **3s**). While a unit is extinguishing a cell, that cell **cannot spread fire**. One cell at a time per unit.
- **Firebreak (dozer):** converts a `GRASSLAND`/`FOREST` cell to `FIREBREAK` over the same action duration. Cannot target houses/animals. A firebreak cell cannot catch or carry fire.
- **Dozer preemption mechanic:** because a warning's developed fire ignites *near but not exactly at* the warning center (see §9), a dozer can lay a firebreak on the predicted ignition cell(s) to prevent the developed fire — but success is **not guaranteed** (it must guess within the scatter radius). This is an intended skill-based counter, not a sure thing.
- **No two units may occupy the same cell.** Pathfinding must avoid stacking; a moving unit's destination is shown as a **silhouette** of the appliance.

### 8.1 Optional (off by default)
- `terrainAccessRules`: restrict certain roles from certain regions. Engine supports; default permissive.

---

## 9. Fire Outbreaks & Warnings

Two outbreak sources feed **one event-injection interface**:

1. **Scripted scenario** (default for experiment-style reproducible play): authored list of timed, placed events. ~**5–6 fire events per 5 minutes** as a reference density (~15–18 over a 15-min round), counting new ignitions + developed fires.
2. **Seeded procedural generator** (for replayable game mode): a seed deterministically produces an equivalent outbreak schedule. "Random" is still reproducible from the seed.

### 9.1 Warning → developed fire flow

1. A **warning** appears at a location with a risk zone, `WARNING_LEAD_TIME` (default **10s**) before ignition. Lead time is configurable and a warning can be **cancelled** by the scenario.
2. On expiry, the **developed fire** ignites at a cell chosen **within `IGNITION_SCATTER_RADIUS` of the warning center** (not exactly the center) — this is the deliberate fix that keeps dozer preemption a gamble rather than a guaranteed counter.
3. **Initial/new fires** ignite only on `GRASSLAND` (per observed behavior). Developed-fire scatter should also resolve to a flammable cell.
4. **Helicopter operators cannot see warnings at all** — truck/dozer operators must relay them. Core teamwork dependency.

---

## 10. Scoring

- **Baseline:** `100,000` (exact), shared team score.
- **Loss-only:** no points are ever gained. Score only decreases.
- **Deduction occurs on `BURNT_OUT`** (not on ignition).
- **Per-cell penalties** (config, toggle — **default both on**):
  - `ASSET_LOSS_PER_CELL` (house/animals): **large**.
  - `VEGETATION_LOSS_PER_CELL` (grassland/forest): **small** (set 0 to make it "protect assets only").
  - Asset loss ≫ vegetation loss.
- **Final score** = whatever remains when the timer hits 0.

---

## 11. Timing & Real-Time Loop

- **Real-time**, continuous. No turn/pause phase (pause-for-planning may be a later option).
- **Round length** configurable: 5-min practice, 15-min formal as references.
- **Tick rate:** fixed-timestep sim (e.g. **10–20 ticks/sec**; choose and document). Render interpolates between ticks. All durations (extinguish, refill, warning lead) are expressed in real seconds and converted to ticks.

---

## 12. Controls & Input

- **Move:** drag a unit to a destination → creates a **waypoint**; the unit pathfinds there (free, no resource cost). Destination shown as the unit's **silhouette**.
- **Redirect:** drag the existing waypoint elsewhere to change course.
- **Cancel:** click a moving unit to cancel its course.
- **Act:**
  - Click a unit sitting **on a burning cell** → begin extinguishing.
  - Click a unit (non-dozer) sitting on a non-burning cell → nothing.
  - Click the **dozer** sitting on a grassland/forest cell → begin firebreak.
- **Multi-unit:** each operator manages **2 units**; UI must allow selecting/commanding each and reading both units' water/fuel.

---

## 13. Per-Role HUD

All operators see: **score**, **round timer**, and a **time forecast** (the experiment showed a forecast clock — clarify use; reserve field). Hovering a unit shows its **water + fuel**. Hovering a cell shows its **coordinates**.

Role-specific:

| HUD element | Helicopter | Truck | Dozer |
|---|---|---|---|
| Wind speed + direction | ✅ | ✅ | ❌ |
| Wind forecast | ✅ | ✅ | ❌ |
| Fire warnings | ❌ | ✅ | ✅ |
| Score / timer | ✅ | ✅ | ✅ |
| Unit water/fuel (hover) | ✅ | ✅ | ✅ |
| Cursor cell coords | ✅ | ✅ | ✅ |

Filtering is enforced **in the snapshot sent to each client**, not just hidden in the UI.

---

## 14. Configuration Parameters (with defaults)

| Param | Default | Notes |
|---|---|---|
| `GRID_W` × `GRID_H` | 50 × 50 | |
| `TICKS_PER_SEC` | 15 | Fixed-timestep |
| `BASELINE_SCORE` | 100000 | |
| `ASSET_LOSS_PER_CELL` | e.g. 500 | Tune to total asset count |
| `VEGETATION_LOSS_PER_CELL` | e.g. 20 | Set 0 for assets-only |
| `LOSS_TOGGLE` | both | `assets_only` \| `both` |
| `FIRE_P0` | 0.08 | Base per-neighbor per-tick catch prob; tune |
| `WIND_DOWNWIND_MULT` | up to ~3–4 | Scaled by wind speed |
| `WIND_UPWIND_MULT` | ~0.05 | Small but nonzero |
| `GRASS_BURN_DURATION` | shorter | |
| `FOREST_BURN_DURATION` | longer | |
| `EXTINGUISH_DURATION` | 3 s | |
| `REFILL_DURATION` | 1.5 s | |
| `SOURCE_CAPACITY` | 100% | = one full tank |
| `SOURCE_REGEN_RATE` | 0 | Off = faithful scarcity |
| `HELI_SPEED_MULT` | 2.5 | vs truck/dozer |
| `HELI_COST` | 50% / 50% | water / fuel per action |
| `TRUCK_COST` | 25% / 25% | |
| `DOZER_COST` | 25% / 25% | |
| `UNITS_PER_OPERATOR` | 2 | |
| `WARNING_LEAD_TIME` | 10 s | |
| `IGNITION_SCATTER_RADIUS` | e.g. 2 cells | Keeps dozer preempt a gamble |
| `ROUND_LENGTH` | 900 s (15 min) | Practice 300 s |
| `OUTBREAK_SOURCE` | scripted | `scripted` \| `seeded` |
| `RANDOM_SEED` | — | Determinism for seeded mode |
| `terrainAccessRules` | off | Optional role/region restriction |
| `ROAD_ENABLED` | off | Optional terrain |

---

## 15. Data Model (sketch)

```ts
type Axial = { q: number; r: number };

type Terrain =
  | "GRASSLAND" | "FOREST" | "WATER_SOURCE" | "FUEL_SOURCE"
  | "HOUSE" | "ANIMALS" | "FIREBREAK" | "ROAD" | "BARE";

type FireState = "UNBURNT" | "IGNITING" | "BURNING" | "BURNT_OUT";

interface Cell {
  coord: Axial;
  terrain: Terrain;
  fire: FireState;
  burnTimer: number;          // ticks remaining when BURNING
  sourceLevel?: number;       // 0..1 for sources
  beingSuppressed: boolean;   // can't spread while true
}

type Role = "HELI" | "TRUCK" | "DOZER";

interface Unit {
  id: string;
  role: Role;
  operatorId: string;
  pos: { x: number; y: number };  // continuous, over hex field
  waypoint?: Axial;
  water: number;                   // 0..1
  fuel: number;                    // 0..1
  action?: { type: "EXTINGUISH" | "FIREBREAK" | "REFILL"; target: Axial; progress: number };
}

interface Wind {
  direction: number; speed: number;
  forecastDirection: number; forecastSpeed: number; forecastEta: number;
}

interface Warning {
  id: string; center: Axial; igniteAtTick: number;
}

interface GameState {
  tick: number;
  grid: Cell[];              // flat, indexed by hex coord
  units: Unit[];
  wind: Wind;
  warnings: Warning[];
  score: number;
  rngState: number;          // seeded PRNG state
  config: Config;
  status: "RUNNING" | "ENDED";
}

type Command =
  | { type: "SET_WAYPOINT"; unitId: string; target: Axial }
  | { type: "CANCEL_MOVE"; unitId: string }
  | { type: "ACT"; unitId: string };   // extinguish or firebreak depending on role+cell

// Pure, deterministic:
function tick(state: GameState, commands: Command[]): GameState;

// Role-filtered view for a client:
function filterSnapshot(state: GameState, role: Role): ClientSnapshot;
```

Tick order each step: apply commands → resolve unit movement → resolve unit actions (extinguish/firebreak/refill progress) → spread fire → advance burn timers & process burnouts (deduct score) → update wind → process warnings/outbreaks → check end condition.

---

## 16. Scenario / Event Format

```ts
interface Scenario {
  seed: number;
  mapSeed: number;              // seeded map generation
  config: Partial<Config>;
  windKeyframes: { atTick: number; direction: number; speed: number }[];
  events: ScenarioEvent[];      // scripted outbreaks/warnings/cancels
}

type ScenarioEvent =
  | { atTick: number; type: "WARNING"; center: Axial; leadTime?: number }
  | { atTick: number; type: "IGNITE"; coord: Axial }       // immediate
  | { atTick: number; type: "CANCEL_WARNING"; id: string };
```

- **Scripted mode**: events authored by hand (experiment reproducibility).
- **Seeded mode**: a generator consumes `seed` to emit an equivalent event list deterministically.
- Map generation also seeded: terrain layout, asset clusters, and source placement. Expose a **source-distribution** parameter (faithful = clustered on one edge, like the experiment; or scattered) so difficulty/coordination load is tunable.

---

## 17. Phased Build Plan

**Phase 1 — Sim core (headless, testable).**
Hex grid + coords + neighbors; cell/terrain model; seeded RNG; fire CA spread + burn + burnout; wind (static then keyframed); scoring; deterministic `tick`. Unit tests on spread statistics (verify ~4–5/6 neighbor catch) and determinism (same seed → same outcome).

**Phase 2 — Units & actions.**
Unit movement over hex field, pathfinding, waypoints, no-stacking; resources; refilling from depletable sources; extinguish + firebreak with durations; action affordability. Tests for resource accounting.

**Phase 3 — Outbreaks & warnings.**
Scenario format + scripted events; warning → scatter ignition; dozer preemption; seeded procedural generator + seeded map gen.

**Phase 4 — Client (single-player).**
Canvas renderer (hex grid, fire states, units, silhouettes, sources, warnings); fixed-timestep loop + render interpolation; drag-to-waypoint controls; one operator drives all 6 units; per-role HUD with snapshot filtering (validate filtering even in single-player by switching role views).

**Phase 5 — Multiplayer.**
WebSocket authoritative server running the same sim core; command transport; role-filtered snapshots per client; lobby (assign 3 operators to roles); reconnection. Single-player local transport remains for testing.

**Phase 6 — Polish & tuning.**
Parameter tuning pass (p0, wind mults, loss values, durations); scenario editor; optional mechanics (wet-cell pre-emptive dampening, road/terrain costs, terrain access rules, source regen); audio/visual feedback.

---

## 18. Deferred / Optional (explicitly out of scope for v1 core)
- Wet-cell mechanic (water reducing ignition prob pre-emptively) — shelved, design later.
- Road and bare terrain gameplay effects — fields reserved, off by default.
- Per-role terrain access restrictions — engine support, off by default.
- In-game map/asset editor ("2D Minecraft" style) — later.
- Pause-for-planning mode — later.

---

*End of specification.*
