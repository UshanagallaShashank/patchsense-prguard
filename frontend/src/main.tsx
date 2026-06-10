import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        style: {
          background: "#161b22",
          border: "1px solid #30363d",
          color: "#e6edf3",
          fontSize: "13px",
        },
      }}
    />
  </StrictMode>
);
