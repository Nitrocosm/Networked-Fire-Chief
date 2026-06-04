/**
 * Active command sink — a singleton the input handlers and HUD use to send
 * commands without prop-drilling. Set to the local transport (single-player) or
 * the net client (multiplayer); both implement `send`.
 */
import type { Command } from "@fire/sim";

export interface CommandSink {
  send(cmd: Command): void;
}

const ref: { sink: CommandSink | null } = { sink: null };

export function setCommandSink(sink: CommandSink | null): void {
  ref.sink = sink;
}

export function sendCommand(cmd: Command): void {
  ref.sink?.send(cmd);
}
