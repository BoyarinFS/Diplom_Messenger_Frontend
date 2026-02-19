# Yoptagramm Frontend 🚀

Современный мессенджер на Next.js 16 с поддержкой Docker-развертывания.

## 📋 Содержание

- [Технологии](#-технологии)
- [Быстрый старт](#-быстрый-старт)
- [Docker развертывание](#-docker-развертывание)
- [Структура проекта](#-структура-проекта)
- [API Endpoints](#-api-endpoints)
- [Переменные окружения](#-переменные-окружения)
- [Разработка](#-разработка)

## 🛠 Технологии

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **State Management:** React Context
- **HTTP Client:** Native fetch
- **WebSocket:** Native WebSocket API
- **Containerization:** Docker + Docker Compose

## 🚀 Быстрый старт

### Локальная разработка

```bash
# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev
```

Приложение будет доступно на http://localhost:3000

### Требования

- Node.js 20+
- npm 10+
- Бэкенд сервис (см. [yoptagramm-backend](https://github.com/your-org/yoptagramm-backend))

## 🐳 Docker развертывание

### Продакшн (с бэкендом)

```bash
# 1. Запустите бэкенд (в отдельной папке)
cd ../yoptagramm-backend
docker-compose up --build

# 2. Запустите фронтенд
cd yoptagramm-frontend
docker-compose up --build
```

**URLs:**
- Frontend: http://localhost:3001
- Backend API: http://localhost (через nginx)

### Только фронтенд

```bash
docker-compose up --build
```

## 📁 Структура проекта

```
yoptagramm-frontend/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes (proxy к бэкенду)
│   │   ├── auth/         # Авторизация (login, register, logout)
│   │   └── proxy/        # Generic proxy для API
│   ├── oauth2/           # OAuth обработка
│   └── page.tsx          # Главная страница
├── src/
│   ├── entities/         # Доменные сущности
│   ├── features/         # Фичи (auth, chat)
│   ├── shared/          # Переиспользуемые модули
│   │   ├── api/        # API клиенты
│   │   ├── ui/         # UI компоненты
│   │   └── types/      # TypeScript типы
│   └── widgets/         # Композиционные виджеты
├── components/          # Legacy компоненты (миграция в src)
├── lib/                # Утилиты и хелперы
├── Dockerfile          # Docker образ
├── docker-compose.yml  # Docker Compose конфиг
└── DOCKER.md          # Подробная Docker документация
```

## 🔌 API Endpoints

### Auth API
| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | `/api/auth/login` | Вход в систему |
| POST | `/api/auth/register` | Регистрация |
| POST | `/api/auth/logout` | Выход |
| GET | `/api/auth/oauth` | OAuth инициализация |

### Proxy API
| Method | Endpoint | Описание |
|--------|----------|----------|
| ALL | `/api/proxy/[...path]` | Проксирование к бэкенду |

## 🔧 Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `BACKEND_URL` | `http://localhost:80/back-yoptagramm-service/api/v1` | URL бэкенда |
| `NODE_ENV` | `development` | Режим работы |
| `PORT` | `3000` | Порт приложения |

## 💻 Разработка

### Команды

```bash
# Dev сервер
npm run dev

# Production build
npm run build

# Линтинг
npm run lint

# Type checking
npx tsc --noEmit
```

### Архитектура (Feature-Sliced Design)

Проект следует методологии [Feature-Sliced Design](https://feature-sliced.design/):

- **entities** — бизнес-сущности (User, Chat, Message)
- **features** — пользовательские сценарии (auth, chat)
- **shared** — переиспользуемые модули (UI, API, utils)
- **widgets** — композиция фич в виджеты

## 📚 Документация

- [Docker Setup](./DOCKER.md) — подробная инструкция по Docker
- [API Documentation](./src/shared/api/) — API клиенты и типы

## 🔗 Связанные репозитории

- [yoptagramm-backend](https://gitlab.com/yoptagramm/backend/yoptagramm-backend.git) — Java Spring Boot бэкенд

## 📝 Лицензия

MIT License — см. [LICENSE](./LICENSE) файл.
