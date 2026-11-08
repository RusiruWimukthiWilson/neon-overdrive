import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/orbitron/latin-500.css";
import "@fontsource/orbitron/latin-700.css";
import "@fontsource/orbitron/latin-900.css";
import "@fontsource/monoton/latin-400.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
