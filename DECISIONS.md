# Networked Fire Chief — Design Decisions (Companion to Spec v1.0)

**Status:** Settled — Phase 1 may begin.
**Relationship to spec:** This document resolves the open questions, ambiguities, and underspecified
parameters in `NETWORKED_FIRE_CHIEF_SPEC.md`. Where this doc and the spec disagree, **this doc wins**
(the spec deliberately left several items as "your choice" / "tune and document"). Section references
(§) point back to the spec.

---

## 1. Resolved gameplay rules

### 1.1 Suppression pauses the burn timer (§5.1, §8)
While a unit is extinguishing a cell, that cell is `BURNING` but `beingSuppressed = true`. During suppression:
- The cell **does not spread** fire to neighbors.
- The cell's `burnTimer` is **paused** (it cannot burn out — and therefore cannot deduct score — while
  actively being worked).

This only governs *during* the action. For what happens *after* a successful extinguish, see 1.2.

### 1.2 Reignition after extinguish (§8, §18)
A successfully-extinguished cell returns to `UNBURNT` (it is intact, not destroyed, not scored). Because
`UNBURNT` flammable cells are valid spread targets, it could otherwise be relit on the very next tick by
the same neighbor that lit it — making lone extinguishing feel pointless near a front.

**Decision:** extinguished cells receive a short **reignition immunity** (`REIGNITE_IMMUNITY`, default ~2s)
during which they cannot catch fire. After it expires, normal spread rules apply.

**Documented for later (not v1):** a lightweight decaying "wetness" multiplier that scales a cell's ignite
probability down for a while instead of a hard binary immunity (a minimal form of the deferred wet-cell
mechanic, §18). Leave a code comment at the immunity site describing this path.

### 1.3 IGNITING is a real telegraph state (§5.1)
`UNBURNT → IGNITING → BURNING → BURNT_OUT`. IGNITING is **not** folded into BURNING. It is a brief,
per-cell "this cell is catching and will be BURNING shortly" ramp. Rationale: enables very-high-difficulty
maps where developed fires arrive every 1–2s — the per-cell ramp becomes the readable tactical layer.

Rules:
- **IGNITING does not spread.** Only `BURNING` spreads. The IGNITING window is therefore a
  *safe-to-interrupt* window: extinguish/firebreak a cell during IGNITING and the fire is stopped before it
  can do anything.
- **Duration** is config (`IGNITING_DURATION`, default ~1–2s, tunable). Shorter window = higher skill ceiling.
- **Uniform path:** a cell always passes through IGNITING whether it caught from a neighbor (spread), from a
  developed fire, or from a scripted `IGNITE`.
- **Acting** during IGNITING uses the normal extinguish/firebreak action (normal cost; normal 2s post-action
  immunity from 1.2).
- **Visibility:** IGNITING is *actual fire state*, not hidden intel, so **all roles see it** (including the
  Heli). This does not break information asymmetry — the Heli still cannot see *warnings* (§9), only a cell
  that is physically catching.

**Tuning note:** because a newly-caught cell sits in IGNITING before it begins spreading, fire growth is
slightly slower than an instant-BURNING model. Tune `FIRE_P0` *with* IGNITING in place during the Phase 1
spread-statistics test, not before.

### 1.4 Three-tier fire telegraph (summary)
| Tier | Meaning | Lead | Scope | Visible to |
|---|---|---|---|---|
| **Warning** (§9) | a fire will *develop* somewhere in this zone | ~10s, strategic | area (scatter radius) | Truck + Dozer (**Heli blind**) |
| **IGNITING** (§5.1) | *this cell* is catching, BURNING soon | ~1–2s, tactical | single cell | **all roles** |
| **BURNING** | active fire; spreads + counts to burnout | — | single cell | all roles |

### 1.5 Refilling is automatic on arrival (§7, §12)
A unit parked on a `WATER_SOURCE` / `FUEL_SOURCE` refills automatically over `REFILL_DURATION` — no command
required. The §12 rule "click a non-burning cell → nothing" means **no resource is expended on click**; it
does not mean a non-burning cell can never have a feature. Water and fuel are separate cell types → separate
trips. Partial refills leave the source proportionally depleted (§7.1).

### 1.6 Action cost is charged up front and actions cannot be cancelled (§7)
The full action cost (extinguish / firebreak) is deducted at action **start**, and an in-progress
extinguish/firebreak **cannot be cancelled** (mirrors committing a real crew to a task). Affordability
(≥ cost in *both* water and fuel) is checked at start; no mid-action refund.

### 1.7 No two units occupy the same cell — no exceptions (§8)
Stacking is never beneficial (two units on one cell = double resource spend for no extra effect), so the
rule is absolute — including Heli-over-ground. No air/ground layering exception. Pathfinding avoids stacking;
a unit will not path onto a cell occupied (or targeted) by another unit.

### 1.8 Scoring of in-progress fires at round end (§10)
Score is only ever deducted at `BURNT_OUT` **during** play. An **extinguished** cell never deducts.
At **game over**, any cell still `BURNING` (or `IGNITING`) is charged once, at that moment, using its
terrain's loss value. Final score = baseline − all burnouts during play − end-of-round in-progress charges.

### 1.9 Scripted IGNITE is admin/god-mode (§4.1, §9.1, §16)
The "new fires only start on `GRASSLAND`" rule governs the **procedural/natural** generator only. A scripted
`IGNITE` scenario event may place fire on **any flammable cell** (`GRASSLAND`, `FOREST`, `HOUSE`, `ANIMALS`).
It is **ignored** (no-op) on non-flammable cells (`WATER_SOURCE`, `FUEL_SOURCE`, `FIREBREAK`, `ROAD`, `BARE`),
since the model has no representation for a burning non-flammable tile.

---

## 2. Wind & forecast

### 2.1 Wind factor: continuous cosine falloff (§5.2, §6)
`windFactor` is computed from the angle between wind direction and the spread direction (burning neighbor → c),
via a smooth **cosine-based falloff** scaled by wind speed, pinned to these anchors:
- Downwind (0°): boosted, up to ~3–4× at full wind speed (`WIND_DOWNWIND_MULT`).
- Crosswind (~90°): ~1× (`WIND_CROSSWIND_MULT` — now an **explicit tunable**, was only "~1" in prose).
- Upwind (180°): ~0.05× (`WIND_UPWIND_MULT`) — small but **nonzero** (rare upwind spread stays possible).

Wind direction is stored as a **continuous angle** (`number`) internally so 360° wind "just works" if ever
added. In practice scenarios use the 6 hex directions; with 6-direction wind the falloff behaves like a clean
per-direction lookup.

### 2.2 Forecast clock = `wind.forecastEta` rendered as absolute time (§13, §15)
The HUD "forecast clock" is **not** a new/undefined element — it renders the existing `wind.forecastEta`
field as an absolute round time: "forecast wind becomes the real wind at **9:32**." Because it is **wind
information**, it is shown to **Heli + Truck only** and **hidden from the Dozer**, consistent with all other
wind data (§13).

---

## 3. Warnings

### 3.1 Displayed risk zone = true scatter radius (§9.1, §15)
The risk zone shown to Truck/Dozer is **exactly** `IGNITION_SCATTER_RADIUS` (no extra fog/fuzz). Rendered as
a translucent ring around the warning center. The dozer-preemption gamble is therefore bounded by **time**
(racing the ~10s lead) over a *known* candidate set — which reads honestly in the UI.
**Snapshot change:** the role-filtered `Warning` view must include the radius so the client can draw the ring
(the §15 `Warning` type currently has only `center` + `igniteAtTick`).

### 3.2 Warning events carry an author-assigned id (§16)
`WARNING` scenario events gain an **`id` field**, and the engine adopts it as the runtime warning's id. This
lets a hand-authored `CANCEL_WARNING { id }` reference the warning it means to cancel (previously impossible —
runtime ids weren't known at authoring time). Example:
```
{ atTick: 100, type: "WARNING",        id: "w1", center: { q: 10, r: 12 } }
{ atTick: 130, type: "CANCEL_WARNING", id: "w1" }
```

### 3.3 Developed-fire scatter with no valid target (§9.1)
If a warning's entire scatter zone contains no flammable cell (all firebreak/water/burnt), the developed fire
**fizzles** (no ignition) rather than crashing or snapping outside the zone. Log it in dev builds.

---

## 4. Single-player information model (§3.3, Phase 4)
Single-player offers a **mode toggle**, sharing one snapshot-filter path underneath:
- **Casual (omniscient):** the solo operator drives all 6 units and sees all warnings + wind. The client
  requests the full state.
- **Challenge (per-role multi-view):** the HUD shows only what the *currently-selected* unit's role is
  allowed to see, forcing the player to switch views and self-coordinate. The client requests the
  role-filtered snapshot for the active unit. Bonus: keeps the filtering code exercised every session.

---

## 5. Determinism (§3.1, §5.2, §15)
Replay determinism is the contract: **same seed + same command sequence → identical world**. Different
actions may diverge; that is expected.
- **Command application order within a tick:** sort queued commands by `unitId`, then by command `type`,
  before applying. (Canonical, transport-independent.)
- **RNG draw order:** fire-spread rolls (and any other per-cell rolls) iterate cells in **flat grid-index
  order**. Document this at the spread loop — refactors must preserve it.
- **Test:** golden-hash replay — record `(seed, command log)`, replay, assert an identical per-tick state
  hash. Backstops every later change. (Phase 1.)
- Keyframed/drifting wind is deterministic; interpolation between wind keyframes is part of the seeded state.

---

## 6. New / clarified config parameters
These extend the §14 table. Values marked *tune-later* are placeholders to be dialed in during Phase 1/6.

| Param | Default | Notes |
|---|---|---|
| `IGNITING_DURATION` | ~1–2 s *(tune-later)* | Tactical reaction window; shorter = harder |
| `REIGNITE_IMMUNITY` | ~2 s *(tune-later)* | Post-extinguish immunity (1.2) |
| `WIND_CROSSWIND_MULT` | ~1.0 | Now explicit (was prose-only) |
| `FUEL_FACTOR_GRASSLAND` | >1 (e.g. 1.3) *(tune-later)* | Catches readily |
| `FUEL_FACTOR_FOREST` | <1 (e.g. 0.7) *(tune-later)* | Slower per-tick, longer burn |
| `FUEL_FACTOR_HOUSE` | e.g. 1.0 *(tune-later)* | Explicit number — assets have their *own* fuelFactor (not "the vegetation they sit in", which has no referent in a one-terrain-per-cell model) |
| `FUEL_FACTOR_ANIMALS` | e.g. 1.0 *(tune-later)* | As above |
| `BASE_MOVE_SPEED` | *(tune-later)* | Cells/sec for truck/dozer; Heli = ×`HELI_SPEED_MULT` |
| Map-gen: house cluster size | ~5–15 cells *(sensible)* | NFC-flavored clusters |
| Map-gen: animal cluster size | ~5–15 cells *(sensible)* | NFC-flavored clusters |
| Map-gen: forest cluster size | ~10–20+ cells *(sensible)* | Larger than assets |
| Map-gen: source counts | *(sensible)* | Chosen with `SOURCE_CAPACITY` |

**Loss-budget rule:** map-gen asset counts must be chosen **together with** `ASSET_LOSS_PER_CELL` /
`VEGETATION_LOSS_PER_CELL` so total possible loss moves the 100,000 baseline meaningfully (neither
un-droppable nor instantly cratered).

---

## 7. Conventions & smaller improvements
- **Coordinates:** storage and neighbor math are **axial (`{q, r}`)**. Offset ("odd-r"/"even-r") rows are a
  **rendering concern only** — never mix the two. State this at the hex module.
- **Snapshots:** design the snapshot to be **diffable** (delta-encodable) from day one; full re-sends are fine
  for single-player, but Phase 5 multiplayer should delta-encode. Don't retrofit.
- **Multiplayer snapshot (§3.2):** `Warning` view must include radius (3.1); confirm wind fields (incl.
  `forecastEta`) are stripped from the Dozer's snapshot, not just hidden in its UI.

---

## 8. Carried-forward "documented-for-later" mechanics
Not in v1, but leave explicit code comments where they'd hook in:
1. **Wetness model** (1.2) — decaying ignite-probability multiplier replacing binary reignition immunity.
2. (IGNITING is now **in** v1, so it is no longer deferred.)
3. Spec §18 deferrals remain deferred: road/bare terrain effects, per-role terrain access, map/asset editor,
   pause-for-planning.
