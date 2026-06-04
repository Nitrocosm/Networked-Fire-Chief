/**
 * Active game session — a singleton the input handlers and HUD use to send
 * commands without prop-drilling the transport through React.
 */
import type { Command } from "@fire/sim";
import type { LocalTransport } from "../transport/local.ts";

const ref: { transport: LocalTransport | null } = { transport: null };

export function setSessionTransport(t: LocalTransport | null): void {
  ref.transport = t;
}

export function sendCommand(cmd: Command): void {
  ref.transport?.send(cmd);
}
