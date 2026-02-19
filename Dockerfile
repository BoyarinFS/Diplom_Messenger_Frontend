# Dockerfile для Next.js 16 production (без standalone)

FROM node:20-alpine

WORKDIR /app

# Устанавливаем переменные окружения
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# URL бэкенда для API routes (переопределяется в docker-compose)
ENV BACKEND_URL=http://localhost:80/back-yoptagramm-service/api/v1

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь код проекта
COPY . .

# Собираем приложение
RUN npm run build

# Открываем порт
EXPOSE 3000

# Запускаем сервер
CMD ["npm", "start"]
