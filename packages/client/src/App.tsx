import { useUi } from "./state/store.ts";
import { Menu } from "./ui/Menu.tsx";
import { Game } from "./ui/Game.tsx";

export function App() {
  const screen = useUi((s) => s.screen);
  const level = useUi((s) => s.level);

  if (screen === "PLAYING" && level) return <Game options={level} />;
  return <Menu />;
}
