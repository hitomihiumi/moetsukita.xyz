# moetsukita.xyz

Сайт художника Moetsukita: лендинг и галерея работ для подписчиков Fanbox и Patreon.
План разработки — [`docs/PLAN.md`](docs/PLAN.md).

Стек: Next.js 16, Once UI 2, next-intl (EN/RU/JA), Drizzle ORM + Postgres (Neon), Cloudflare R2.

## Локальный запуск

Нужны Node.js 22+ и Docker.

```bash
npm install
cp .env.example .env.local      # значения по умолчанию подходят для docker-compose
docker compose up -d            # Postgres 17 и RustFS (S3-совместимая замена R2)
npm run storage:setup           # бакеты, CORS, lifecycle
npm run db:migrate              # схема базы
npm run db:seed -- --demo       # уровни, теги и демо-работы
npm run dev
```

- Сайт: http://localhost:3000
- Консоль RustFS: http://localhost:9001 (логин `moetsukita` / `moetsukita-secret`)
- Просмотр базы: `npm run db:studio`

## Скрипты

| Команда                           | Что делает                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js                                                                           |
| `npm run typecheck`               | Проверка типов                                                                    |
| `npm run lint` / `format`         | Biome                                                                             |
| `npm run validate:ui`             | Валидатор кода Once UI                                                            |
| `npm run db:generate`             | Новая миграция из изменений `src/server/db/schema.ts`                             |
| `npm run db:migrate`              | Применить миграции из `drizzle/`                                                  |
| `npm run db:seed`                 | Стартовые уровни и теги (`-- --demo` — ещё и демо-работы)                         |
| `npm run db:studio`               | Drizzle Studio                                                                    |
| `npm run storage:setup`           | Настроить бакеты (CORS, lifecycle; локально — ещё создать их и открыть публичный) |
| `npm run storage:check`           | Проверить доступ к хранилищу: подписанные ссылки, их истечение, multipart         |

## Продакшен (Vercel + Neon + R2)

1. **Neon**: создать проект, взять _pooled_ строку подключения → `DATABASE_URL`.
2. **R2**: создать два бакета:
   - приватный (`R2_BUCKET`) — оригиналы, превью, копии с водяным знаком; **без** публичного доступа и своего домена;
   - публичный (`R2_PUBLIC_BUCKET`) — только размытые превью; подключить к нему свой домен
     (например `cdn.moetsukita.xyz`) → `R2_PUBLIC_BASE_URL`.

   API-токен с правами Object Read & Write на оба бакета → `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`. `R2_ENDPOINT` и `R2_FORCE_PATH_STYLE` не задавать.
3. `STORAGE_CORS_ORIGINS=https://moetsukita.xyz` и один раз `npm run storage:setup` с продакшен-переменными.
4. **Vercel**: переменные из `.env.example`. Скрипт `vercel-build` применяет миграции перед сборкой.
