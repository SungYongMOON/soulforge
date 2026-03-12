import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@soulforge/theme-adventurers-desk/theme.css";
import "@soulforge/renderer-react/renderer.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Renderer root container was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
