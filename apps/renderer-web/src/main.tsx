import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./theme.css";
import "./app.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Renderer root container was not found.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
