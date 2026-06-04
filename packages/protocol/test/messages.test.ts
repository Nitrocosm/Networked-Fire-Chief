import { describe, it, expect } from "vitest";
import { createInitialState, makeUnit, tick, type WorldState } from "@fire/sim";
import {
  decodeClientMsg,
  encodeClientMsg,
  encodeServerMsg,
  filterForRole,
  snapshotToWire,
  toSnapshot,
  wireToClientView,
} from "../src/index.ts";

function world(): WorldState {
  const s = createInitialState({
    seed: 1,
    config: { GRID_W: 8, GRID_H: 8, ROUND_LENGTH_SEC: 100000 },
    units: [makeUnit({ id: "h1", role: "HELI", operatorId: "op", cell: 0 })],
    events: [{ atTick: 1, type: "WARNING", id: "secret-warning", center: 20, leadTime: 50 }],
  });
  return tick(s); // create the warning
}

describe("wire snapshot codec", () => {
  it("round-trips typed arrays through number[]", () => {
    const full = toSnapshot(world());
    const back = wireToClientView(snapshotToWire(full));
    expect(back.terrain).toBeInstanceOf(Uint8Array);
    expect(Array.from(back.terrain)).toEqual(Array.from(full.terrain));
    expect(Array.from(back.fire)).toEqual(Array.from(full.fire));
    expect(back.tick).toBe(full.tick);
  });
});

describe("role filtering at the WIRE level", () => {
  const full = toSnapshot(world());

  it("a HELI's serialized message carries no warning data at all", () => {
    const wire = snapshotToWire(filterForRole(full, "HELI"));
    expect(wire.warnings).toBeNull();
    expect(wire.wind).not.toBeNull();
    const bytes = encodeServerMsg({ type: "SNAPSHOT", snap: wire });
    expect(bytes).not.toContain("secret-warning"); // the id never leaves the server
  });

  it("a DOZER's serialized message carries no wind data at all", () => {
    const wire = snapshotToWire(filterForRole(full, "DOZER"));
    expect(wire.wind).toBeNull();
    expect(wire.warnings).not.toBeNull();
    const bytes = encodeServerMsg({ type: "SNAPSHOT", snap: wire });
    expect(bytes).not.toContain("forecastEtaTick"); // wind field name absent
  });

  it("a TRUCK gets both; the full (casual) snapshot does leak the id", () => {
    const wire = snapshotToWire(filterForRole(full, "TRUCK"));
    expect(wire.wind).not.toBeNull();
    expect(wire.warnings).not.toBeNull();
    expect(encodeServerMsg({ type: "SNAPSHOT", snap: snapshotToWire(full) })).toContain("secret-warning");
  });
});

describe("client message decode", () => {
  it("round-trips lobby + command messages", () => {
    expect(decodeClientMsg(encodeClientMsg({ type: "JOIN_ROOM", code: "FIRE-1" }))).toEqual({ type: "JOIN_ROOM", code: "FIRE-1" });
    expect(decodeClientMsg(encodeClientMsg({ type: "CLAIM_ROLE", role: "TRUCK" }))).toEqual({ type: "CLAIM_ROLE", role: "TRUCK" });
    const cmd = encodeClientMsg({ type: "COMMAND", command: { type: "ACT", unitId: "t1" } });
    expect(decodeClientMsg(cmd)).toEqual({ type: "COMMAND", command: { type: "ACT", unitId: "t1" } });
  });

  it("rejects malformed input", () => {
    expect(decodeClientMsg("not json")).toBeNull();
    expect(decodeClientMsg(JSON.stringify({ type: "CLAIM_ROLE", role: "WIZARD" }))).toBeNull();
    expect(decodeClientMsg(JSON.stringify({ type: "JOIN_ROOM" }))).toBeNull();
  });
});
