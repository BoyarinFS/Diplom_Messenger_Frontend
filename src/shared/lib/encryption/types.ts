export interface KeyBundleRequest {
  identityPublicKey: string;
  identityPrivateKey: string;
  signedPreKeyPublic: string;
  signedPreKeyPrivate: string;
  signedPreKeySignature: string;
  oneTimePreKeys: string[];
}

export interface RegistrationRequestWithKeys {
  username: string;
  email: string;
  password: string;
  firstname: string;
  lastname: string;
  about?: string;
  keyBundleRequest: KeyBundleRequest;
}

export interface EncryptedPrivateKeys {
  identityPrivateKey: string;
  signedPreKeyPrivate: string;
  oneTimePreKeys: string[];
}

export interface PublicKeyBundle {
  identityPublicKey: string;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  oneTimePreKeys: string[];
}

export interface UserKeyBundle {
  identityKeyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  signedPreKeyPair: {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  };
  signedPreKeySignature: Uint8Array;
  oneTimePreKeys: Array<{
    id: number;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }>;
}

export interface CryptoSession {
  chatId: string;
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  recipientPublicKey?: Uint8Array;
  groupKey?: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  hmac: string;
  ephemeralPublicKey?: string;
  messageNumber?: number;
  keyId?: string;
}

export interface EncryptedKeyResponse {
  identityPrivateKey: string;
  signedPreKeyPrivate: string;
  oneTimePreKeys: string[];
}

export interface RecipientPublicKeys {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  oneTimePreKeyId?: number;
}
