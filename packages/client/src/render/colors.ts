import { Fire, Terrain } from "@fire/sim";

export const TERRAIN_COLOR: Record<number, string> = {
  [Terrain.GRASSLAND]: "#5b9140",
  [Terrain.FOREST]: "#2f5e2c",
  [Terrain.WATER_SOURCE]: "#1f4f7a",
  [Terrain.FUEL_SOURCE]: "#5a3b86",
  [Terrain.HOUSE]: "#9aa3b2",
  [Terrain.ANIMALS]: "#b07c4a",
  [Terrain.FIREBREAK]: "#6f6048",
  [Terrain.ROAD]: "#444a55",
  [Terrain.BARE]: "#3a3f48",
};

/** Overlay color for a non-UNBURNT cell, or null to leave the terrain showing. */
export function fireColor(fire: number): string | null {
  switch (fire) {
    case Fire.IGNITING:
      return "#ffd24a";
    case Fire.BURNING:
      return "#ff531f";
    case Fire.BURNT_OUT:
      return "#1b1b1e";
    default:
      return null;
  }
}

export const ROLE_COLOR: Record<string, string> = {
  HELI: "#4aa3ff",
  TRUCK: "#ff6b6b",
  DOZER: "#ffce4a",
};
