# Culinary Blog

Nền tảng chia sẻ công thức nấu ăn — đồ án học phần Phát triển ứng dụng web nâng cao.

## Tech stack

| Layer | Công nghệ |
|---|---|
| Backend | NestJS 11 (CommonJS + Jest), Clean Architecture + CQRS |
| Frontend | Next.js App Router, TypeScript, Tailwind |
| Database | PostgreSQL 16 + Drizzle ORM, Full-Text Search tiếng Việt (`tsvector` + unaccent) |
| Cache / Jobs | Redis 7 (ioredis), BullMQ |
| Storage | MinIO (S3-compatible) |
| Auth | JWT (access 15m, refresh 7d có rotation) + Google OAuth 2.0 |
| Observability | Pino, OpenTelemetry, lỗi theo RFC 7807 |

## Chạy dự án

Yêu cầu: Node >= 20, pnpm 12, Docker.

```bash
pnpm install
cp .env.example .env
```

**Local dev**

```bash
pnpm dev        # backend + frontend song song
pnpm dev:be     # chỉ backend
pnpm dev:fe     # chỉ frontend  -> http://localhost:3000
```

> macOS: port 5000 bị AirPlay Receiver chiếm, đổi `BACKEND_PORT=5050` trong `.env`.

**Docker (full stack + nginx)**

```bash
pnpm docker:up      # http://localhost  (/ -> frontend, /api/ -> backend)
pnpm docker:down
```

## Scripts

| Lệnh | Mô tả |
|---|---|
| `pnpm build` | Build toàn workspace |
| `pnpm lint` | Lint toàn workspace |
| `pnpm typecheck` | Typecheck toàn workspace |
| `pnpm db:generate` | Sinh migration Drizzle |
| `pnpm db:migrate` | Chạy migration |
| `pnpm --filter backend test` | Unit test backend |

## Cấu trúc

```
apps/
  backend/src/{modules,infrastructure,common}/   # NestJS
  frontend/src/{app,components,lib}/             # Next.js
packages/
  shared/    # @culinary/shared — DTO types dùng chung BE <-> FE
  config/    # tsconfig.base.json
nginx/       # reverse proxy config
```

## License

[MIT](LICENSE)
