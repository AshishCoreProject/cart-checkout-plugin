import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Library must not bundle React: React 18 host + inlined React 19 jsx-dev-runtime
// causes "__CLIENT_INTERNALS... recentlyCreatedOwnerStacks" crashes at runtime.
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/index.ts",
      name: "CartCheckoutPlugin",
      fileName: "cart-checkout-plugin",
    },
    rollupOptions: {
      external: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
  },
});
