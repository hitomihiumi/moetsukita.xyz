# moetsukita.xyz

Сайт художника Moetsukita: лендинг и галерея работ для подписчиков Fanbox и Patreon.
План разработки — [`docs/PLAN.md`](docs/PLAN.md).

Стек: Next.js 16, Once UI 2, next-intl (EN/RU/JA), Drizzle ORM + Postgres, RustFS (S3-совместимое
хранилище файлов). Всё работает на одном сервере в Docker, HTTPS — через Caddy.

## Продакшен на своём сервере

Нужен сервер с Docker (Compose v2) и два домена, направленных на него (A/AAAA-записи):
сайт (`moetsukita.xyz`) и файлы (`files.moetsukita.xyz`). Открыть порты 80 и 443.

```bash
git clone https://github.com/hitomihiumi/moetsukita.xyz && cd moetsukita.xyz/deploy
cp .env.example .env          # заполнить: домены, email, пароли (openssl rand -base64 32)
docker compose up -d --build
docker compose run --rm migrate npm run db:seed   # один раз: стартовые уровни и теги
```

Что поднимается (`deploy/compose.yaml`):

| Сервис          | Назначение                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| `caddy`         | HTTPS-сертификаты Let's Encrypt, прокси на сайт и на хранилище. Единственный сервис с портами наружу |
| `app`           | Сайт (Next.js standalone)                                                                            |
| `migrate`       | Применяет миграции базы при каждом запуске и завершается; сайт стартует после него                   |
| `storage-setup` | Создаёт бакеты, CORS, автоочистку и публичный доступ к бакету превью; завершается                    |
| `postgres`      | База данных                                                                                          |
| `storage`       | RustFS: оригиналы, превью, копии с водяным знаком                                                    |
| `backup`        | Ежедневный дамп базы в `deploy/backups/`, хранит `BACKUP_KEEP_DAYS` дней                             |

Файлы:
- Приватный бакет (`S3_BUCKET`) открывается только по подписанным ссылкам, которые выдаёт сайт; ссылка
  на скачивание живёт 90 секунд.
- Публичный бакет (`S3_PUBLIC_BUCKET`) содержит только размытые превью.
- На домене файлов Caddy пропускает только пути этих двух бакетов; список бакетов и админ-API RustFS закрыты.
- Консоль RustFS слушает только `127.0.0.1:9001` на сервере: `ssh -L 9001:127.0.0.1:9001 сервер`,
  затем http://localhost:9001.

Обновление: `git pull && docker compose up -d --build` (миграции применятся сами).

Резервные копии: дампы базы — в `deploy/backups/`; файлы лежат в Docker-томе `moetsukita_storage`,
его стоит копировать отдельно (например, `restic` или `rsync` каталога тома).
Восстановление базы: `gunzip -c backups/<файл>.sql.gz | docker compose exec -T postgres psql -U moetsukita moetsukita`.

## Локальная разработка

Нужны Node.js 22+ и Docker.

```bash
npm install
cp .env.example .env.local      # значения по умолчанию подходят для compose.yaml
docker compose up -d            # Postgres 17 и RustFS
npm run storage:setup           # бакеты, CORS, автоочистка
npm run db:migrate              # схема базы
npm run db:seed -- --demo       # уровни, теги и демо-работы
npm run dev
```

- Сайт: http://localhost:3000
- Консоль RustFS: http://localhost:9001 (логин `moetsukita` / `moetsukita-secret`)
- Просмотр базы: `npm run db:studio`

## Скрипты

| Команда                           | Что делает                                                             |
| --------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev` / `build` / `start` | Next.js                                                                |
| `npm run typecheck`               | Проверка типов                                                         |
| `npm run lint` / `format`         | Biome                                                                  |
| `npm run validate:ui`             | Валидатор кода Once UI                                                 |
| `npm run db:generate`             | Новая миграция из изменений `src/server/db/schema.ts`                  |
| `npm run db:migrate`              | Применить миграции из `drizzle/`                                       |
| `npm run db:seed`                 | Стартовые уровни и теги (`-- --demo` — ещё и демо-работы)              |
| `npm run db:studio`               | Drizzle Studio                                                         |
| `npm run storage:setup`           | Создать и настроить бакеты (CORS, автоочистка, публичный бакет превью) |
| `npm run storage:check`           | Проверить хранилище: подписанные ссылки, их истечение, multipart       |
