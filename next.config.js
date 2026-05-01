/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: [
      "@google-cloud/pubsub",
      "firebase-admin",
      "firebase-admin/app",
      "firebase-admin/firestore"
    ]
  }
};

module.exports = nextConfig;
