# Signal Protocol Encryption - Документация

## Обзор

Реализация end-to-end шифрования на основе Signal Protocol для мессенджера Yoptagramm.

## Используемые библиотеки и алгоритмы

| Компонент | Библиотека | Алгоритм | Назначение |
|-----------|-----------|----------|------------|
| Асимметричное шифрование | `tweetnacl` | X25519 (ECDH) | Генерация ключевых пар |
| Цифровая подпись | `tweetnacl` | Ed25519 | Подпись signed pre-key |
| Симметричное шифрование | Web Crypto API | AES-256-GCM | Шифрование приватных ключей паролем |
| Key Derivation | Web Crypto API | PBKDF2 | Получение ключа из пароля |

## Три типа ключей Signal Protocol

### 1. Identity Key (долгосрочный)
- **Алгоритм**: X25519 (ECDH)
- **Назначение**: Долгосрочная идентификация пользователя
- **Ротация**: Только при компрометации
- **Использование**: Подписывает Signed Pre-key, участвует в X3DH

### 2. Signed Pre-key (среднесрочный)
- **Алгоритм**: X25519 (ECDH) + Ed25519 (подпись)
- **Назначение**: Ускорение установки сессий
- **Ротация**: Раз в месяц
- **Подпись**: Identity Key подписывает public key Signed Pre-key

### 3. One-time Pre-keys (50 штук, одноразовые)
- **Алгоритм**: X25519 (ECDH)
- **Назначение**: Perfect Forward Secrecy
- **Использование**: Один ключ = один чат
- **Пополнение**: Когда остается меньше 20

## Поток шифрования при регистрации

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Пользователь|     │  Браузер (Frontend) │     |   Backend   │
└─────────────┘     └─────────────────────┘     └─────────────┘
       │                      │                      │
       │  Вводит пароль       │                      │
       │─────────────────────►│                      │
       │                      │                      │
       │                      │  1. Генерация ключей │
       │                      │  ├─ Identity (X25519)│
       │                      │  ├─ Signed Pre-key   │
       │                      │  └─ 50 One-time keys │
       │                      │                      │
       │                      │  2. Шифрование       │
       │                      │  ├─ PBKDF2(password) │
       │                      │  ├─ AES-256-GCM      │
       │                      │  └─ Salt + IV + Data │
       │                      │                      │
       │                      │  3. Формирование     │
       │                      │     keyBundleRequest │
       │                      │  ├─ public keys      │
       │                      │  ├─ encrypted private│
       │                      │  └─ signature        │
       │                      │                      │
       │                      │─────────────────────►│
       │                      │  POST /auth/reg      │
       │                      │  {keyBundleRequest}  │
       │                      │                      │
       │                      │◄─────────────────────│
       │                      │  4. Сохранение       │
       │                      │     encrypted keys   │
       │                      │     в IndexedDB      │
       │                      │                      │
       │  Успех!              │                      │
       │◄─────────────────────│                      │
```

## Поток при логине

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Пользователь|     │  Браузер (Frontend) │     │   Backend   │
└─────────────┘     └─────────────────────┘     └─────────────┘
       │                      │                       │
       │  Вводит логин/пароль │                       │
       │─────────────────────►│                       │
       │                      │                       │
       │                      │─────────────────────► │
       │                      │  POST /auth/login     │
       │                      │  {login, password}    │
       │                      │                       │
       │                      │◄───────────────────── │
       │                      │  Ответ с ключами:     │
       │                      │  accountKeysResponse  │
       │                      │  {                    │
       │                      │    identityPrivateKey │
       │                      │    signedPreKeyPrivate│
       │                      │  }                    │
       │                      │                       │
       │                      │  1. PBKDF2(password)  │
       │                      │     + salt из ключа   │
       │                      │     → AES-256 key     │
       │                      │                       │
       │                      │  2. AES-GCM decrypt   │
       │                      │     → приватные ключи │
       │                      │                       │
       │                      │  3. Сохранение в      │
       │                      │     IndexedDB         │
       │                      │                       │
       │  Успех!              │                       │
       │◄─────────────────────│                       │
```

## Детали шифрования приватных ключей

### Шаг 1: PBKDF2 - получение ключа из пароля

```typescript
password + salt (16 bytes, random) 
  ↓
PBKDF2 (100,000 iterations, SHA-256)
  ↓
AES-256 key (32 bytes)
```

### Шаг 2: AES-256-GCM шифрование

```typescript
plaintext (private key) 
  + IV (12 bytes, random)
  + AES-256 key
  ↓
AES-GCM encrypt
  ↓
ciphertext + auth tag (16 bytes)
```

### Шаг 3: Формат хранения

```
salt (16 bytes) + IV (12 bytes) + ciphertext (32 bytes) + tag (16 bytes) = 76 bytes
  ↓
Base64 encoding → ~100-104 символа
```

## Структура keyBundleRequest (регистрация)

```json
{
  "identityPublicKey": "base64(32 bytes X25519 public)",
  "identityPrivateKey": "base64(salt[16] + iv[12] + ciphertext[32] + tag[16])",
  "signedPreKeyPublic": "base64(32 bytes X25519 public)",
  "signedPreKeyPrivate": "base64(salt[16] + iv[12] + ciphertext[32] + tag[16])",
  "signedPreKeySignature": "base64(64 bytes Ed25519 signature)",
  "oneTimePreKeys": [
    "base64(32 bytes)",
    "... 50 штук"
  ]
}
```

## Ответ сервера при логине (accountKeysResponse)

```json
{
  "token": "string",
  "email": "string",
  "account": { ... },
  "status": "ACTIVE",
  "accountKeysResponse": {
    "identityPrivateKey": "base64(encrypted)",
    "signedPreKeyPrivate": "base64(encrypted)"
  }
}
```

## Хранение в IndexedDB

```typescript
{
  id: "user_keys",
  identityPrivateKey: "base64(76 bytes)",
  signedPreKeyPrivate: "base64(76 bytes)",
  oneTimePreKeys: ["base64(76 bytes concatenated keys)"],
  updatedAt: 1234567890
}
```

## Безопасность

| Аспект | Реализация |
|--------|-----------|
| Приватные ключи | Никогда не покидают браузер в открытом виде |
| Пароль | Используется только для расшифровки на клиенте |
| Сервер | Получает только публичные ключи + зашифрованные приватные |
| Хранилище | IndexedDB изолирована по origin |
| Salt | Уникален для каждого пользователя |
| IV | Уникален для каждого шифрования |
| Аутентификация | AES-GCM обеспечивает конфиденциальность + целостность |

## Структура файлов

```
src/shared/lib/encryption/
├── types.ts           # TypeScript интерфейсы
├── signal-protocol.ts # Генерация ключей, шифрование/дешифрование
├── key-storage.ts     # IndexedDB для хранения ключей
└── index.ts           # Barrel exports
```

## Зависимости

```json
{
  "dependencies": {
    "tweetnacl": "^1.0.3"
  }
}
```

Web Crypto API (встроен в браузер) используется для PBKDF2 и AES-GCM.

## Почему именно эти алгоритмы?

| Алгоритм | Причина выбора |
|----------|---------------|
| **X25519** | Быстрый, безопасный ECDH, используется в Signal, WireGuard |
| **Ed25519** | Современная подпись, быстрая проверка, компактная (64 байта) |
| **AES-256-GCM** | Аутентифицированное шифрование (конфиденциальность + целостность) |
| **PBKDF2** | Стандартный KDF, защита от брутфорса (100k итераций) |
| **TweetNaCl** | Проверенная библиотека, используется в Signal, размер ~1KB |

## Дальнейшие шаги

1. ✅ **Регистрация**: Генерация и отправка ключей
2. ✅ **Логин**: Получение и расшифровка ключей
3. 🔄 **Создание DM чата**: X3DH (Extended Triple Diffie-Hellman) для установки сессии
4. 🔄 **Отправка сообщений**: Double Ratchet Algorithm
5. 🔄 **Групповые чаты**: Симметричный ключ чата, зашифрованный для каждого участника

## TODO

- [ ] Получение one-time keys при логине (сейчас пустой массив)
- [ ] Ротация signed pre-key (раз в месяц)
- [ ] Пополнение one-time keys когда заканчиваются
- [ ] X3DH для установки сессий DM
- [ ] Double Ratchet для шифрования сообщений
