import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" — only needed for Docker/Cloud Run, breaks Vercel module resolution
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
