import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/ocbot",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
