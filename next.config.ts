import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/relay",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
