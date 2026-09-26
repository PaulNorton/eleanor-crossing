import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Allow the Tailscale MagicDNS name (e.g. my-machine.tailnet.ts.net).
    allowedHosts: ['.ts.net'],
  },
  preview: {
    allowedHosts: ['.ts.net'],
  },
});
