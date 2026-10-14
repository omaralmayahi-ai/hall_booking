import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { registerMapServiceWorker } from "./lib/offline-iraq-map";
import { applyAppearance } from "./hooks/use-appearance";

setAuthTokenGetter(() => localStorage.getItem("token"));
registerMapServiceWorker();

// Arabic RTL interface + saved visual preferences (theme colour, dark mode, font)
document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";
applyAppearance();

createRoot(document.getElementById("root")!).render(<App />);
