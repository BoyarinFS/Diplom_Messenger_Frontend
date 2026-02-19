# Docker Setup для Yoptagramm Frontend

## Конфигурация

- **Порт**: 3001 (хост) → 3000 (контейнер)
- **Backend URL**: `http://yopta-nginx/back-yoptagramm-service/api/v1` (внутри Docker сети)
- **Node.js**: 20-alpine

## Запуск (оба сервиса в Docker)

### 1. Сначала запустите бэкенд

```bash
cd yoptagramm-backend
docker-compose up --build
```

Бэкенд будет доступен на: http://localhost (nginx на 80 порту)

### 2. Затем запустите фронтенд

```bash
# В корне проекта (где этот файл)
docker-compose up --build
```

Frontend будет доступен на: http://localhost:3001

## Сетевое взаимодействие

Оба сервиса используют общую Docker сеть `common-network`:
- Frontend → `yopta-nginx:80` (nginx бэкенда)
- Бэкенд API доступен через nginx прокси

## Переменные окружения

| Переменная | Значение | Описание |
|------------|----------|----------|
| `BACKEND_URL` | `http://yopta-nginx/back-yoptagramm-service/api/v1` | URL бэкенда через nginx |
| `NODE_ENV` | `production` | Режим работы |
| `PORT` | `3000` | Порт внутри контейнера |

## Пересборка

```bash
# Полная пересборка фронтенда
docker-compose down
docker-compose up --build --force-recreate

# Пересборка обоих сервисов
cd yoptagramm-backend && docker-compose down && docker-compose up --build
cd .. && docker-compose up --build
```

## Проверка работы

1. Откройте http://localhost:3001
2. Проверьте API endpoints:
   - POST http://localhost:3001/api/auth/login
   - POST http://localhost:3001/api/auth/register
   - GET/POST http://localhost:3001/api/proxy/...

## Устранение неполадок

### Ошибка 500 на API routes
- Проверьте что бэкенд запущен: `docker ps` (должен быть контейнер yopta-nginx)
- Проверьте сеть: `docker network inspect common-network`
- Убедитесь что оба сервиса в одной сети `common-network`

### Ошибка "useSearchParams() should be wrapped in a Suspense boundary"
- Исправлено: компонент обернут в Suspense

### Ошибка "middleware file convention is deprecated"
- Исправлено: используется `export default function middleware`
