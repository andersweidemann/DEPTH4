import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: { disableDevLogs: true },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signal/shared", "@signal/ai"],
  /** Stops /_next static chunk loads from failing when the tab uses 127.0.0.1 but the visit was started as localhost (or the reverse). */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default withPWA(nextConfig);
