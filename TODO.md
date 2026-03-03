# TODO: Реализация файловой системы в Yoptagramm

## ✅ Завершено

### 1. Типы и интерфейсы
- [x] Добавлены типы для работы с файлами в `src/shared/types/types.ts`
  - `AttachmentType` - типы привязки (MESSAGE, PROFILE, CHAT)
  - `FileMetadata` - метаданные файла
  - `UploadUrlRequest` / `UploadUrlResponse` - для получения URL загрузки
  - `ConfirmUploadRequest` - для подтверждения загрузки
  - `FileAttachment` - привязка файла к сущности
  - `DownloadUrlResponse` - ответ со ссылкой на скачивание
  - `CreateDmResponse` / `GetDmKeysResponse` - для DM шифрования

### 2. API клиент
- [x] Расширен `ApiClient` в `src/shared/api/api.ts`
  - `getUploadUrl()` - получение presigned URL для загрузки
  - `confirmUpload()` - подтверждение загрузки файла
  - `getFile()` - получение метаданных файла
  - `deleteFile()` - удаление файла
  - `getDownloadUrl()` - получение ссылки на скачивание
  - `getUserFiles()` - получение файлов пользователя
  - `getEntityAttachments()` - получение файлов сущности
  - `attachFile()` / `detachFile()` - привязка/отвязка файлов

### 3. Сервис загрузки файлов
- [x] Создан `src/shared/lib/file-upload.ts`
  - Загрузка файла напрямую в MinIO через presigned URL
  - Отслеживание прогресса загрузки
  - Валидация типов и размера файла
  - Подтверждение загрузки после успешной отправки

### 4. File Entity
- [x] Создана сущность `src/entities/file/`
  - `types.ts` - типы для файловой сущности
  - `utils.ts` - утилиты для работы с файлами (форматирование размера, валидация MIME)

### 5. File Feature
- [x] Создан feature `src/features/file/`
  - `index.ts` - экспорт компонентов и хуков
  - `hooks/useFileUpload.ts` - хук для загрузки файлов
  - `hooks/useFileDownload.ts` - хук для скачивания файлов
  - `hooks/useFileAttachments.ts` - хук для управления привязками
  - `components/file-upload.tsx` - компонент загрузки файла
  - `components/file-preview.tsx` - компонент предпросмотра файла
  - `components/file-list.tsx` - список файлов
  - `components/compact-file-preview.tsx` - компактный превью для чата

### 6. Интеграция с чатом
- [x] Обновлен `src/features/chat/components/chat-window.tsx`
  - Добавлена кнопка прикрепления файлов (Paperclip)
  - Отображение прикрепленных файлов перед отправкой
  - Отображение файлов в сообщениях
  - Поддержка файлов в reply и thread сообщениях
  - Очищены отладочные логи

### 7. Шифрование
- [x] Очищены отладочные логи из:
  - `src/shared/lib/encryption/signal-protocol.ts`
  - `src/features/chat/hooks/use-chat-encryption.ts`
  - `src/features/auth/providers/encryption-context.tsx`
  - `src/shared/lib/encryption/x3dh.ts` (метод `base64ToArray` сделан публичным)

## 🚧 В процессе

### Интеграция с другими features
- [ ] Добавить загрузку аватара профиля
- [ ] Добавить загрузку аватара чата
- [ ] Добавить drag & drop для файлов

## 📋 Планируется

### UI/UX улучшения
- [ ] Добавить индикатор прогресса загрузки
- [ ] Добавить превью для изображений перед отправкой
- [ ] Добавить поддержку галереи изображений
- [ ] Добавить контекстное меню для файлов (скачать, удалить, переслать)

### Оптимизация
- [ ] Ленивая загрузка файлов
- [ ] Кэширование миниатюр
- [ ] Оптимизация больших файлов

### Безопасность
- [ ] Проверка MIME типов на бэкенде
- [ ] Ограничение размера файлов
- [ ] Валидация расширений файлов

## 📝 Примечания

- Все отладочные `console.log` удалены из production кода
- TypeScript ошибки исправлены
- API эндпоинты соответствуют спецификации бэкенда
- Поддерживаемые типы файлов: изображения, видео, аудио, документы
- Максимальный размер файла: 100MB (ограничение бэкенда)
