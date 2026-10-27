import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "./App";
import { initTheme } from "./hooks/useTheme";
import { ApiError } from "./lib/api";
import "./index.css";

initTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 2,
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => {
      // A 401/403 on any write usually means the session ended; refresh who we are.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    },
  }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-center" closeButton theme="system" />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
