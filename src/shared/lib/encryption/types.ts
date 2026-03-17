// Убираем импорты из библиотеки, используем any для типов
export interface KeyBundleRequest {
  registrationId: number;
  identityPublicKey: string;      // base64
  signedPreKeyPublic: string;     // base64
  signedPreKeySignature: string;  // base64
  oneTimePreKeys: string[];       // base64 array
}

export interface ReceiverKeys {
  registrationId: number;
  identityPublicKey: string;      // base64
  signedPreKeyPublic: string;     // base64
  signedPreKeySignature: string;  // base64
  oneTimePreKey?: string;         // base64
}

export interface EncryptedPrivateKeys {
  registrationId?: number;
  identityPrivateKey: string;     // base64 (AES-GCM encrypted)
  signedPreKeyPrivate: string;    // base64 (AES-GCM encrypted)
  preKeys: string[];              // base64 array (AES-GCM encrypted)
}

export interface DecryptedKeyBundle {
  identityKeyPair: any;  // Signal.IdentityKeyPair
  signedPreKey: any;     // Signal.PrivateKey
  preKeys: any[];        // Signal.PrivateKey[]
  registrationId: number;
}

export interface StoredSessionRecord {
  chatId: string;
  record: string;  // base64(SessionRecord.serialize())
  version: number;
  updatedAt: number;
}