import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// No StrictMode: the game loop must not be double-started in development.
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
