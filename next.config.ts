import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Relay",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
