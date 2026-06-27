import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from bundling these Node.js-only packages.
  // They are available at runtime in the Node.js server process.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
