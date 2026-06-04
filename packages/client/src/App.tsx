import { useUi } from "./state/store.ts";
import { Menu } from "./ui/Menu.tsx";
import { Game } from "./ui/Game.tsx";
import { MpLobby } from "./ui/MpLobby.tsx";
import { MpGame } from "./ui/MpGame.tsx";

export function App() {
  const screen = useUi((s) => s.screen);
  const level = useUi((s) => s.level);

  switch (screen) {
    case "SP":
      return level ? <Game options={level} /> : <Menu />;
    case "MP_LOBBY":
      return <MpLobby />;
    case "MP_GAME":
      return <MpGame />;
    default:
      return <Menu />;
  }
}
