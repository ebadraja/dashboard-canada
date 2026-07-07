/** @type {import('next').NextConfig} */
// NOTE (see STACK.md): this app is deployed as a long-running Node server
// (`next build` then `next start`), NOT as serverless functions, so that
// Server-Sent Events streams for the VA rail can stay open. Do not move the
// API to a stateless serverless target without revisiting the real-time layer.
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
