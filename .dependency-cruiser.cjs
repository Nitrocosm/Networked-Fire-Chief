/**
 * Architectural boundary guardrails (CI-blocking).
 *
 * Dependency direction must always point TOWARD the deterministic core:
 *   client / server  ->  protocol  ->  sim
 *
 * The sim core is a leaf with ZERO browser deps. Filtering lives in protocol
 * so both transports (local single-player + ws multiplayer) share one filter.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies break determinism reasoning and module init order.",
      from: {},
      to: { circular: true },
    },
    {
      name: "sim-has-no-browser-deps",
      severity: "error",
      comment: "@fire/sim must never import React, Zustand, ws, or any DOM/browser lib.",
      from: { path: "^packages/sim/src" },
      to: { path: "node_modules/(react|react-dom|zustand|ws|pixi\\.js)" },
    },
    {
      name: "sim-is-a-leaf",
      severity: "error",
      comment: "@fire/sim may not depend on any other workspace package.",
      from: { path: "^packages/sim/src" },
      to: { path: "^packages/(protocol|server|client)/src" },
    },
    {
      name: "protocol-no-app-deps",
      severity: "error",
      comment: "@fire/protocol may import sim (types) only — not server or client.",
      from: { path: "^packages/protocol/src" },
      to: { path: "^packages/(server|client)/src" },
    },
    {
      name: "server-not-from-client",
      severity: "error",
      comment: "Server must not import the browser client.",
      from: { path: "^packages/server/src" },
      to: { path: "^packages/client/src" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
    },
    includeOnly: "^packages/[^/]+/src",
  },
};
