import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  /** Avoid caching navigations aggressively — OAuth `/auth/callback` must always hit the network. */
  aggressiveFrontEndNavCaching: false,
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: { disableDevLogs: true, importScripts: ["/sw-push.js"] },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@signal/shared", "@signal/ai"],
  /** Stops /_next static chunk loads from failing when the tab uses 127.0.0.1 but the visit was started as localhost (or the reverse). */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async redirects() {
    return [
      { source: "/feed-2", destination: "/feed", permanent: true },
      { source: "/feed-2/:path*", destination: "/feed/:path*", permanent: true },
      { source: "/book-2", destination: "/book", permanent: true },
      { source: "/book-2/:path*", destination: "/book/:path*", permanent: true },
    ];
  },
};

export default withPWA(nextConfig);
