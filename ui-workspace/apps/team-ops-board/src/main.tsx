import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./team-ops.css";
import "./team-ops-responsive.css";

// Default-OFF Watch strip, loaded LAZILY so the default Board neither loads
// the strip module nor depends on serving its cross-root guild_hall import.
const WatchStrip = lazy(() => import("./watch-strip").then((module) => ({ default: module.WatchStrip })));

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

// Rendered only with an explicit ?watch=1 in the URL (evaluated at page
// load — toggling the query needs a reload). Without the flag the Board
// renders exactly as before.
const watchStripEnabled = new URLSearchParams(window.location.search).get("watch") === "1";

createRoot(rootElement).render(
  <StrictMode>
    {watchStripEnabled ? <Suspense fallback={null}><WatchStrip /></Suspense> : null}
    <App />
  </StrictMode>
);
