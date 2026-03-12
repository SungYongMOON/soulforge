import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyThemeSelection } from "./themes";
import "@soulforge/renderer-react/renderer.css";
import "./lab.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Skin lab root container was not found.");
}

applyThemeSelection(new URLSearchParams(window.location.search).get("theme"));

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
