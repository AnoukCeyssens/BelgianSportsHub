import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Opt in to the v8 behaviour now, so the eventual upgrade is a no-op.
  future: {
    v8_viteEnvironmentApi: true,
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
