import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import "./index.css";
import App from "./App.tsx";
import { queryClient } from "./lib/query-client";
import { AuthProvider } from "./features/auth/AuthContext";
import { ThemeProvider } from "./components/theme-provider";
import { initDevToken } from "./lib/auth-dev";

// Initialize dev token for development (only if not using real auth)
// This will be skipped if user is already authenticated
if (import.meta.env.DEV) {
  // Only init dev token if no auth exists
  const existingAuth = localStorage.getItem("gymms_auth");
  if (!existingAuth) {
    initDevToken();
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
            {import.meta.env.DEV && (
              <ReactQueryDevtools initialIsOpen={false} />
            )}
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
