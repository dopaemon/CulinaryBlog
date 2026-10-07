import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const { loadEnvConfig } = nextEnv;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `pnpm dev:fe` (pnpm --filter) đặt cwd = apps/frontend nên Next.js tự load .env ở đó, không thấy
// .env ở repo root -> nạp tay bằng @next/env (cùng cơ chế Next.js dùng nội bộ, đã ship kèm `next`).
loadEnvConfig(path.join(__dirname, '../../'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  agentRules: false,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@culinary/shared'],
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
};

export default nextConfig;
