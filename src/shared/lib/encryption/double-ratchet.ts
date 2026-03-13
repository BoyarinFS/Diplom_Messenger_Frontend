/**
 * Double Ratchet - упрощенная реализация
 * 
 * Использует X3DH для создания начального общего секрета,
 * затем применяет symmetric-key ratchet для каждого сообщения.
 */

import nacl from 'tweetnacl';
import type { EncryptedMessage } from './types';

const MAX_SKIPPED_MESSAGES = 1000;

/**
 * Конвертация ArrayBuffer/Uint8Array в base64
 */
function arrayToBase64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

/**
 * Конвертация base64 в Uint8Array
 */
function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function kdfChainKey(chainKey: Uint8Array, prefix: 'SENDING'|'RECEIVING'): Uint8Array {
  const encoder = new TextEncoder();
  const prefixed = new Uint8Array([...encoder.encode(prefix), ...chainKey]);
  const hash = nacl.hash(prefixed);
  return hash.slice(0, 32);
}

/**
 * KDF для получения message key из chain key
 */
function kdfMessageKey(chainKey: Uint8Array): Uint8Array {
  const hash = nacl.hash(new Uint8Array([0x03, ...chainKey]));
  return hash.slice(0, 32);
}

export interface RatchetState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array | null;
  receivingChainKey: Uint8Array | null;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
}

export interface RatchetSession {
  chatId: string;
  ratchet: DoubleRatchet;
  theirIdentityKey: Uint8Array;
  theirCurrentEphemeralKey?: Uint8Array;
  ourEphemeralKeyPair?: { publicKey: Uint8Array; privateKey: Uint8Array };
  createdAt: number;
  lastUsedAt: number;
}

export class DoubleRatchet {
  private rootKey: Uint8Array;
  private sendingChainKey: Uint8Array | null = null;
  private receivingChainKey: Uint8Array | null = null;
  private sendingMessageNumber = 0;
  private receivingMessageNumber = 0;
  private skippedMessageKeys: Map<number, Uint8Array> = new Map();
  readonly processedMessages: Set<string> = new Set();
  
  private myIdentityPrivateKey: Uint8Array | null = null;
  private mySignedPreKeyPrivate: Uint8Array | null = null;
  private theirCurrentEphemeralKey: Uint8Array | null = null;
  

  constructor(rootKey: Uint8Array) {
    this.rootKey = rootKey;

  }

  setPrivateKeys(identityPrivate: Uint8Array, signedPreKeyPrivate: Uint8Array): void {
    this.myIdentityPrivateKey = identityPrivate;
    this.mySignedPreKeyPrivate = signedPreKeyPrivate;
  }

  setTheirEphemeralKey(ephemeralKey: Uint8Array): void {

    this.theirCurrentEphemeralKey = ephemeralKey;
  }

  /**
   * Инициализировать как отправитель (Alice)
   */
  initAsSender(): void {
    this.sendingChainKey = kdfChainKey(this.rootKey, 'SENDING');
  }

  /**
   * Инициализировать как получатель (Bob)
   */
  initAsReceiver(): void {
    // Получатель должен уметь расшифровать первое сообщение отправителя.
    // Поэтому initial receiving chain должен соответствовать sending chain отправителя.
    this.receivingChainKey = kdfChainKey(this.rootKey, 'SENDING');
  }

  /**
   * Инициализировать как отвечающий (Bob) - для двустороннего обмена
   * После получения первого сообщения нужно иметь обе цепочки для отправки и получения
   */
  initAsResponder(): void {
    // Ответчик отправляет сообщения по "обратному" направлению,
    // поэтому его sending chain должна быть противоположной initial цепочке отправителя.
    this.sendingChainKey = kdfChainKey(this.rootKey, 'RECEIVING');
  }

  /**
   * Добавить receiving chain для отправителя (Alice)
   * После отправки первого сообщения нужно иметь возможность получать ответы
   */
  addReceivingChain(): void {
    this.receivingChainKey = kdfChainKey(this.rootKey, 'RECEIVING');
  }

  // DISABLED: performDHRatchet interferes with symmetric ratchet during history decrypt
  performDHRatchet(theirNewEphemeralKey: Uint8Array): void {
    console.warn('⚠️ performDHRatchet DISABLED - use only for DH ratchet advancement');
    // TODO: Proper DH ratchet implementation needed for forward secrecy
    return;
  }

  /**
   * Шифрование сообщения
   */
  encrypt(plaintext: string): EncryptedMessage {
    if (!this.sendingChainKey) {
      throw new Error('Ratchet not initialized for sending');
    }

    const messageKey = kdfMessageKey(this.sendingChainKey);
    this.sendingChainKey = kdfChainKey(this.sendingChainKey!, 'SENDING');

    const nonce = nacl.randomBytes(24);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = nacl.secretbox(plaintextBytes, nonce, messageKey);

    if (!ciphertext) {
      throw new Error('Encryption failed');
    }

    const msg: EncryptedMessage = {
      ciphertext: arrayToBase64(ciphertext),
      iv: arrayToBase64(nonce),
      hmac: '',
      messageNumber: this.sendingMessageNumber++,
    };

    return msg;
  }

  /**
   * Дешифрование сообщения
   */
  decrypt(encryptedMessage: EncryptedMessage): string {
    if (!this.receivingChainKey) {
      throw new Error('Ratchet not initialized for receiving');
    }

    const msgNumber = encryptedMessage.messageNumber ?? 0;
    const msgKeyId = `${msgNumber}-${encryptedMessage.hmac || 'no-hmac'}`;
    
    console.log('🔓 decrypt: messageNumber:', msgNumber, 'current:', this.receivingMessageNumber, 'keyId:', msgKeyId);

    // Проверяем дублирование сообщения
    if (this.processedMessages.has(msgKeyId)) {
      throw new Error(`Message ${msgNumber} already processed`);
    }
    this.processedMessages.add(msgKeyId);

    let messageKey: Uint8Array;

    // Используем пропущенный ключ
    if (this.skippedMessageKeys.has(msgNumber)) {
      messageKey = this.skippedMessageKeys.get(msgNumber)!;
      this.skippedMessageKeys.delete(msgNumber);
      console.log('🔓 Using skipped message key for:', msgNumber);
    } else if (msgNumber === this.receivingMessageNumber) {
      // Текущее ожидаемое сообщение
      messageKey = kdfMessageKey(this.receivingChainKey);
      // Продвигаем chain ТОЛЬКО после успешного дешифрования текущего
      console.log('🔓 Derived message key from chain, will advance after decrypt');
    } else if (msgNumber > this.receivingMessageNumber) {
      // Пропущенные сообщения - вычисляем ключи БЕЗ продвижения chain
      console.log('🔓 Skipping ahead to message', msgNumber);
      let tempChainKey = this.receivingChainKey;
      
      // Вычисляем пропущенные ключи (НЕ сохраняем в основной chain)
    for (let i = this.receivingMessageNumber; i < msgNumber; i++) {
        const skippedKey = kdfMessageKey(tempChainKey!);
        this.skippedMessageKeys.set(i, skippedKey);
        tempChainKey = kdfChainKey(tempChainKey!, 'RECEIVING');
      }
      
      messageKey = kdfMessageKey(tempChainKey!);
      console.log(`🔓 Created ${msgNumber - this.receivingMessageNumber} skipped keys`);
    } else {
      throw new Error(`Cannot decrypt message ${msgNumber}: already passed this message number`);
    }

    console.log('🔓 decrypt: messageKey:', arrayToBase64(messageKey));

    // Дешифруем
    const ciphertext = base64ToArray(encryptedMessage.ciphertext);
    const nonce = base64ToArray(encryptedMessage.iv);
    
    const plaintext = nacl.secretbox.open(ciphertext, nonce, messageKey);

    if (!plaintext) {
      // Очищаем processed mark на ошибке
      this.processedMessages.delete(msgKeyId);
      throw new Error('Decryption failed: invalid ciphertext or key');
    }

    // Продвигаем chain и счетчик ТОЛЬКО при успехе
    if (msgNumber === this.receivingMessageNumber) {
      this.receivingChainKey = kdfChainKey(this.receivingChainKey!, 'RECEIVING');
      this.receivingMessageNumber++;
      console.log('✅ Chain advanced, new receiving number:', this.receivingMessageNumber);
    }

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Stateless-дешифрование по rootKey и messageNumber (не мутирует состояние).
   * Нужно для расшифровки собственных отправленных сообщений и истории.
   */
  decryptFromRoot(encryptedMessage: EncryptedMessage, direction: 'SENDING' | 'RECEIVING'): string {
    const msgNumber = encryptedMessage.messageNumber ?? 0;
    if (msgNumber < 0 || msgNumber > MAX_SKIPPED_MESSAGES) {
      throw new Error(`Invalid messageNumber: ${msgNumber}`);
    }

    let chainKey = kdfChainKey(this.rootKey, direction);
    for (let i = 0; i < msgNumber; i++) {
      chainKey = kdfChainKey(chainKey, direction);
    }

    const messageKey = kdfMessageKey(chainKey);
    const ciphertext = base64ToArray(encryptedMessage.ciphertext);
    const nonce = base64ToArray(encryptedMessage.iv);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, messageKey);
    if (!plaintext) {
      throw new Error('Decryption failed: invalid ciphertext or key');
    }
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Получить текущее состояние ratchet для сохранения
   */
  getState(): RatchetState & { skippedKeys?: number[] } {
    const state: any =  {
      rootKey: new Uint8Array(this.rootKey),
      sendingChainKey: this.sendingChainKey ? new Uint8Array(this.sendingChainKey) : null,
      receivingChainKey: this.receivingChainKey ? new Uint8Array(this.receivingChainKey) : null,
      sendingMessageNumber: this.sendingMessageNumber,
      receivingMessageNumber: this.receivingMessageNumber,
    };
    
    // Сериализуем только недавние skipped keys (последние 50)
    const recentSkipped: number[] = [];
    for (const [key] of this.skippedMessageKeys) {
      if (recentSkipped.length < 50) {
        recentSkipped.push(key);
      } else break;
    }
    state.skippedKeysSnapshot = recentSkipped;
    
    return state;
  }

  /**
   * Восстановить состояние ratchet из сохраненного
   */
  setState(state: RatchetState & { skippedKeysSnapshot?: number[] }): void {
    this.rootKey = new Uint8Array(state.rootKey);
    this.sendingChainKey = state.sendingChainKey ? new Uint8Array(state.sendingChainKey) : null;
    this.receivingChainKey = state.receivingChainKey ? new Uint8Array(state.receivingChainKey) : null;
    this.sendingMessageNumber = state.sendingMessageNumber;
    this.receivingMessageNumber = state.receivingMessageNumber;
    
    // Восстанавливаем skipped keys если есть snapshot
    if (state.skippedKeysSnapshot) {
      for (const msgNum of state.skippedKeysSnapshot) {
        // Пересоздаем skipped keys при восстановлении (approximate)
        let tempChain = this.receivingChainKey;
        for (let i = this.receivingMessageNumber; i <= msgNum; i++) {
          if (i === msgNum) {
            const skippedKey = kdfMessageKey(tempChain!);
            this.skippedMessageKeys.set(msgNum, skippedKey);
            break;
          }
        tempChain = kdfChainKey(tempChain!, 'RECEIVING');
        }
      }
    }
  }

  /**
   * Обновить счетчики после сохранения/загрузки
   */
  setMessageNumbers(sending: number, receiving: number): void {
    this.sendingMessageNumber = sending;
    this.receivingMessageNumber = receiving;
  }

  /**
   * Проверить инициализацию для отправки
   */
  isInitializedForSending(): boolean {
    return this.sendingChainKey !== null;
  }

  /**
   * Проверить инициализацию для получения
   */
  isInitializedForReceiving(): boolean {
    return this.receivingChainKey !== null;
  }

  /**
   * Получить текущий номер сообщения для отправки
   */
  getSendingMessageNumber(): number {
    return this.sendingMessageNumber;
  }

  /**
   * Получить текущий номер сообщения для получения
   */
  getReceivingMessageNumber(): number {
    return this.receivingMessageNumber;
  }
}

/**
 * X3DH - Symmetric Key Agreemeent
 * 
 * Обе стороны вычисляют одинаковый shared secret используя:
 * - DH1: identityPrivate * theirSignedPreKey (у отправителя) = signedPreKeyPrivate * theirIdentity (у получателя)
 * - DH2: ephemeralPrivate * theirIdentity (у отправителя) = identityPrivate * theirEphemeral (у получателя)
 * 
 * Результат должен быть одинаковым благодаря коммутативности скалярного умножения на эллиптических кривых
 */
// В double-ratchet.ts, замените объект X3DH на:

export const X3DH = {
  /**
   * Вычислить общий секрет (Alice - отправитель)
   * Используем DH1, DH2, DH3 для полной совместимости
   */
  calculateSharedSecretAsSender(
    identityPrivateKey: Uint8Array,
    ephemeralPrivateKey: Uint8Array,
    recipientIdentityKey: Uint8Array,
    recipientSignedPreKey: Uint8Array,
    recipientOneTimePreKey?: Uint8Array
  ): Uint8Array {
    // DH1: Alice_identityPrivate * Bob_signedPreKeyPublic
    const dh1 = nacl.scalarMult(identityPrivateKey, recipientSignedPreKey);
    
    // DH2: Alice_ephemeralPrivate * Bob_identityPublic
    const dh2 = nacl.scalarMult(ephemeralPrivateKey, recipientIdentityKey);
    
    // DH3: Alice_ephemeralPrivate * Bob_signedPreKeyPublic
    const dh3 = nacl.scalarMult(ephemeralPrivateKey, recipientSignedPreKey);
    
    // DH4: Alice_ephemeralPrivate * Bob_oneTimePreKey (опционально)
    let dh4: Uint8Array | null = null;
    if (recipientOneTimePreKey) {
      dh4 = nacl.scalarMult(ephemeralPrivateKey, recipientOneTimePreKey);
    }

    // Комбинируем в правильном порядке
    const combined = dh4 
      ? new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4])
      : new Uint8Array([...dh1, ...dh2, ...dh3]);

    return nacl.hash(combined).slice(0, 32);
  },

  /**
   * Вычислить общий секрет (Bob - получатель)
   * Должен дать тот же результат, что и у отправителя
   */
  calculateSharedSecretAsReceiver(
    identityPrivateKey: Uint8Array,
    signedPreKeyPrivate: Uint8Array,
    senderIdentityKey: Uint8Array,
    senderEphemeralKey: Uint8Array,
    oneTimePreKeyPrivate?: Uint8Array
  ): Uint8Array {
    // DH1: Bob_signedPreKeyPrivate * Alice_identityPublic
    const dh1 = nacl.scalarMult(signedPreKeyPrivate, senderIdentityKey);
    
    // DH2: Bob_identityPrivate * Alice_ephemeralPublic
    const dh2 = nacl.scalarMult(identityPrivateKey, senderEphemeralKey);
    
    // DH3: Bob_signedPreKeyPrivate * Alice_ephemeralPublic
    const dh3 = nacl.scalarMult(signedPreKeyPrivate, senderEphemeralKey);
    
    // DH4: Bob_oneTimePreKeyPrivate * Alice_ephemeralPublic (опционально)
    let dh4: Uint8Array | null = null;
    if (oneTimePreKeyPrivate) {
      dh4 = nacl.scalarMult(oneTimePreKeyPrivate, senderEphemeralKey);
    }

    // Комбинируем в том же порядке!
    const combined = dh4 
      ? new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4])
      : new Uint8Array([...dh1, ...dh2, ...dh3]);

    return nacl.hash(combined).slice(0, 32);
  },

  generateEphemeralKeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    const keyPair = nacl.box.keyPair();
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.secretKey,
    };
  },

  base64ToArray,
};