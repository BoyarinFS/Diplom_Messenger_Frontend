import nacl from 'tweetnacl';
import type { ReceiverKeys } from '@/shared/types';

/**
 * X3DH (Extended Triple Diffie-Hellman) Key Agreement
 * 
 * Используется для установки начальной сессии шифрования между двумя пользователями.
 * Основан на спецификации Signal Protocol.
 */
export class X3DH {
  /**
   * Выполняет X3DH handshake от лица отправителя (Alice)
   * 
   * @param identityPrivateKey - Приватный ключ идентичности отправителя (X25519)
   * @param ephemeralPrivateKey - Эфемерный приватный ключ отправителя (X25519)
   * @param recipientIdentityKey - Публичный ключ идентичности получателя (X25519)
   * @param recipientSignedPreKey - Подписанный публичный ключ получателя (X25519)
   * @param recipientOneTimePreKey - Одноразовый публичный ключ получателя (X25519, optional)
   * @returns Общий секрет (32 bytes)
   */
  static aliceCalculateSecret(
    identityPrivateKey: Uint8Array,
    ephemeralPrivateKey: Uint8Array,
    recipientIdentityKey: Uint8Array,
    recipientSignedPreKey: Uint8Array,
    recipientOneTimePreKey?: Uint8Array
  ): Uint8Array {
    // DH1: Alice's identity key + Bob's signed pre-key
    const dh1 = nacl.scalarMult(identityPrivateKey, recipientSignedPreKey);
    
    // DH2: Alice's ephemeral key + Bob's identity key
    const dh2 = nacl.scalarMult(ephemeralPrivateKey, recipientIdentityKey);
    
    // DH3: Alice's ephemeral key + Bob's signed pre-key
    const dh3 = nacl.scalarMult(ephemeralPrivateKey, recipientSignedPreKey);
    
    // DH4: Alice's ephemeral key + Bob's one-time pre-key (if available)
    let dh4: Uint8Array | null = null;
    if (recipientOneTimePreKey) {
      dh4 = nacl.scalarMult(ephemeralPrivateKey, recipientOneTimePreKey);
    }

    // Combine all DH results into shared secret
    return this.deriveSharedSecret(dh1, dh2, dh3, dh4);
  }

  /**
   * Выполняет X3DH handshake от лица получателя (Bob)
   * 
   * @param identityPrivateKey - Приватный ключ идентичности получателя (X25519)
   * @param signedPreKeyPrivate - Приватный подписанный ключ получателя (X25519)
   * @param oneTimePreKeyPrivate - Одноразовый приватный ключ получателя (X25519, optional)
   * @param senderIdentityKey - Публичный ключ идентичности отправителя (X25519)
   * @param senderEphemeralKey - Эфемерный публичный ключ отправителя (X25519)
   * @returns Общий секрет (32 bytes)
   */
  static bobCalculateSecret(
    identityPrivateKey: Uint8Array,
    signedPreKeyPrivate: Uint8Array,
    oneTimePreKeyPrivate: Uint8Array | null,
    senderIdentityKey: Uint8Array,
    senderEphemeralKey: Uint8Array
  ): Uint8Array {
    // DH1: Bob's signed pre-key + Alice's identity key
    const dh1 = nacl.scalarMult(signedPreKeyPrivate, senderIdentityKey);
    
    // DH2: Bob's identity key + Alice's ephemeral key
    const dh2 = nacl.scalarMult(identityPrivateKey, senderEphemeralKey);
    
    // DH3: Bob's signed pre-key + Alice's ephemeral key
    const dh3 = nacl.scalarMult(signedPreKeyPrivate, senderEphemeralKey);
    
    // DH4: Bob's one-time pre-key + Alice's ephemeral key (if available)
    let dh4: Uint8Array | null = null;
    if (oneTimePreKeyPrivate) {
      dh4 = nacl.scalarMult(oneTimePreKeyPrivate, senderEphemeralKey);
    }

    // Combine all DH results into shared secret
    return this.deriveSharedSecret(dh1, dh2, dh3, dh4);
  }

  /**
   * Генерирует эфемерную ключевую пару для X3DH
   */
  static generateEphemeralKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.secretKey,
    };
  }

  /**
   * Парсит публичные ключи получателя из ответа API
   */
  static parseRecipientKeys(keys: ReceiverKeys): {
    identityKey: Uint8Array;
    signedPreKey: Uint8Array;
    signedPreKeySignature: Uint8Array;
    oneTimePreKey?: Uint8Array;
  } {
    return {
      identityKey: this.base64ToArray(keys.identityPublicKey),
      signedPreKey: this.base64ToArray(keys.signedPreKeyPublic),
      signedPreKeySignature: this.base64ToArray(keys.signedPreKeySignature),
      oneTimePreKey: keys.oneTimePreKey ? this.base64ToArray(keys.oneTimePreKey) : undefined,
    };
  }

  /**
   * Проверяет подпись подписанного публичного ключа
   */
  static verifySignedPreKey(
    identityPublicKey: Uint8Array,
    signedPreKey: Uint8Array,
    signature: Uint8Array
  ): boolean {
    // Convert X25519 public key to Ed25519 for signature verification
    // Note: This is a simplified version. In production, you'd need proper X25519->Ed25519 conversion
    try {
      return nacl.sign.detached.verify(signedPreKey, signature, identityPublicKey);
    } catch {
      return false;
    }
  }

  /**
   * Выводит общий секрет из DH результатов с использованием KDF
   */
  private static deriveSharedSecret(
    dh1: Uint8Array,
    dh2: Uint8Array,
    dh3: Uint8Array,
    dh4: Uint8Array | null
  ): Uint8Array {
    // Concatenate all DH results
    const input = dh4 
      ? new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4])
      : new Uint8Array([...dh1, ...dh2, ...dh3]);

    // Use HKDF-like construction with SHA-256
    // Simplified: just hash the concatenation
    // In production, use proper HKDF
    return this.hash(input);
  }

  /**
   * SHA-256 hash
   */
  private static hash(data: Uint8Array): Uint8Array {
    // Use nacl.hash for proper hashing
    return nacl.hash(data).slice(0, 32);
  }

  static base64ToArray(base64: string): Uint8Array {

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Результат X3DH handshake
 */
export interface X3DHResult {
  sharedSecret: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  usedOneTimePreKeyId?: number;
}
