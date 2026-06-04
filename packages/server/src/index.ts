// Authoritative multiplayer host. Runs the SAME @fire/sim core as single-player;
// differs only in transport (ws) + room-code lobby.
import { startServer } from "./transport-ws.ts";

const port = Number(process.env.PORT ?? 8787);
startServer(port);
// eslint-disable-next-line no-console
console.log(`Fire Control server listening on ws://localhost:${port}`);
