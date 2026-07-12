import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (!root) throw new Error("Application root element is missing");

createRoot(root).render(
  <StrictMode>
    <App session={{ status: "signed_out" }} />
  </StrictMode>,
);
