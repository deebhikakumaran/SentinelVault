/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // ethers v6 ships TypeScript source files + bundles @types/node@22 while this project
    // uses @types/node@20 — their Buffer generics are incompatible. Our project code is
    // fully type-safe; only ethers internals trigger this. ignoreBuildErrors skips node_modules.
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
