/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@workspace/config",
    "@workspace/db",
    "@workspace/observability",
    "@workspace/workflows",
    "@workspace/ui",
  ],
  serverExternalPackages: ["pg"],
}

export default nextConfig
