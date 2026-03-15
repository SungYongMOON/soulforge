import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { controlCenterPlugin } from "./controlCenterPlugin";

export default defineConfig({
  plugins: [react(), controlCenterPlugin()]
});
