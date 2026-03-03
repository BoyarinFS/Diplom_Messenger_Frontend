import nacl from 'tweetnacl';
import type { EncryptedMessage } from './types';

/**
 * Double Ratchet Algorithm
 * 
 * Обеспечивает forward secrecy и future secrecy для сообщений.
 * Каждое сообщение использует новый ключ шифрования.
 */
export class DoubleRatchet {
  private rootKey: Uint8Array;
  private sendingChainKey: Uint8Array | null = null;
  private receivingChainKey: Uint8Array | null = null;
  private sendingMessageNumber = 0;
  private receivingMessageNumber = 0;
  private skippedMessageKeys: Map<number, Uint8Array> = new Map();

  constructor(sharedSecret: Uint8Array) {
    // Initialize root key from X3DH shared secret
    this.rootKey = this.kdfRootKey(sharedSecret);
  }

  /**
   * Инициализирует Double Ratchet для отправителя (Alice)
   * После X3DH, Alice генерирует новый ephemeral ключ и выполняет DH
   */
  initSender(ephemeralPrivateKey: Uint8Array, recipientPublicKey: Uint8Array): void {
    const dhResult = nacl.scalarMult(ephemeralPrivateKey, recipientPublicKey);
    const [newRootKey, chainKey] = this.kdfRatchetStep(this.rootKey, dhResult);
    this.rootKey = newRootKey;
    this.sendingChainKey = chainKey;
  }

  /**
   * Инициализирует Double Ratchet для получателя (Bob)
   * Bob использует свой приватный ключ и полученный ephemeral ключ от Alice
   */
  initReceiver(privateKey: Uint8Array, senderEphemeralPublicKey: Uint8Array): void {
    const dhResult = nacl.scalarMult(privateKey, senderEphemeralPublicKey);
    const [newRootKey, chainKey] = this.kdfRatchetStep(this.rootKey, dhResult);
    this.rootKey = newRootKey;
    this.receivingChainKey = chainKey;
  }

  /**
   * Шифрует сообщение
   */
  encrypt(plaintext: string): EncryptedMessage {
    if (!this.sendingChainKey) {
      throw new Error('Double Ratchet not initialized for sending');
    }

    // Derive message key from chain key
    const messageKey = this.kdfMessageKey(this.sendingChainKey);
    
    // Advance chain key
    this.sendingChainKey = this.kdfChainKey(this.sendingChainKey);
    
    // Encrypt message
    const nonce = nacl.randomBytes(24);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = nacl.secretbox(plaintextBytes, nonce, messageKey);

    const message: EncryptedMessage = {
      ciphertext: this.arrayToBase64(ciphertext),
      iv: this.arrayToBase64(nonce),
      hmac: '', // HMAC is implicit in nacl.secretbox
      messageNumber: this.sendingMessageNumber++,
    };

    return message;
  }

  /**
   * Дешифрует сообщение
   */
  decrypt(encryptedMessage: EncryptedMessage): string {
    if (!this.receivingChainKey) {
      throw new Error('Double Ratchet not initialized for receiving');
    }

    const msgNumber = encryptedMessage.messageNumber ?? 0;

    // Check if we need to skip messages (out of order)
    if (msgNumber > this.receivingMessageNumber) {
      // Store skipped message keys
      while (this.receivingMessageNumber < msgNumber) {
        const skippedKey = this.kdfMessageKey(this.receivingChainKey!);
        this.skippedMessageKeys.set(this.receivingMessageNumber, skippedKey);
        this.receivingChainKey = this.kdfChainKey(this.receivingChainKey!);
        this.receivingMessageNumber++;
      }
    }

    // Get appropriate message key
    let messageKey: Uint8Array;
    if (msgNumber === this.receivingMessageNumber) {
      messageKey = this.kdfMessageKey(this.receivingChainKey);
      this.receivingChainKey = this.kdfChainKey(this.receivingChainKey);
      this.receivingMessageNumber++;
    } else if (this.skippedMessageKeys.has(msgNumber)) {
      messageKey = this.skippedMessageKeys.get(msgNumber)!;
      this.skippedMessageKeys.delete(msgNumber);
    } else {
      throw new Error(`Cannot decrypt message ${msgNumber}: key not found`);
    }

    // Decrypt
    const ciphertext = this.base64ToArray(encryptedMessage.ciphertext);
    const nonce = this.base64ToArray(encryptedMessage.iv);
    const plaintext = nacl.secretbox.open(ciphertext, nonce, messageKey);

    if (!plaintext) {
      throw new Error('Decryption failed: invalid ciphertext or key');
    }

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Выполняет DH ratchet step (при получении нового ephemeral ключа)
   */
  performDHRatchet(theirEphemeralPublicKey: Uint8Array, myEphemeralPrivateKey: Uint8Array): void {
    const dhResult = nacl.scalarMult(myEphemeralPrivateKey, theirEphemeralPublicKey);
    const [newRootKey, receivingChainKey] = this.kdfRatchetStep(this.rootKey, dhResult);
    
    this.rootKey = newRootKey;
    this.receivingChainKey = receivingChainKey;
    this.receivingMessageNumber = 0;
    
    // Generate new ephemeral key pair for next ratchet
    const newKeyPair = nacl.box.keyPair();
    const dhResult2 = nacl.scalarMult(newKeyPair.secretKey, theirEphemeralPublicKey);
    const [newRootKey2, sendingChainKey] = this.kdfRatchetStep(this.rootKey, dhResult2);
    
    this.rootKey = newRootKey2;
    this.sendingChainKey = sendingChainKey;
    this.sendingMessageNumber = 0;
  }

  /**
   * KDF для root key (из X3DH shared secret)
   */
  private kdfRootKey(input: Uint8Array): Uint8Array {
    // Simplified KDF using hash
    // In production, use HKDF
    return nacl.hash(new Uint8Array([0x00, ...input])).slice(0, 32);
  }

  /**
   * KDF для ratchet step
   */
  private kdfRatchetStep(rootKey: Uint8Array, dhResult: Uint8Array): [Uint8Array, Uint8Array] {
    const input = new Uint8Array([...rootKey, ...dhResult]);
    const hash = nacl.hash(input);
    return [
      hash.slice(0, 32),   // new root key
      hash.slice(32, 64), // chain key
    ];
  }

  /**
   * KDF для message key
   */
  private kdfMessageKey(chainKey: Uint8Array): Uint8Array {
    // Derive 32-byte message key from chain key
    const hash = nacl.hash(new Uint8Array([0x01, ...chainKey]));
    return hash.slice(0, 32);
  }

  /**
   * KDF для advancing chain key
   */
  private kdfChainKey(chainKey: Uint8Array): Uint8Array {
    // Advance chain key
    const hash = nacl.hash(new Uint8Array([0x02, ...chainKey]));
    return hash.slice(0, 32);
  }

  private arrayToBase64(array: Uint8Array): string {
    const binary = String.fromCharCode(...array);
    return btoa(binary);
  }

  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
  }

  // Getters for state
  getSendingMessageNumber(): number {
    return this.sendingMessageNumber;
  }

  getReceivingMessageNumber(): number {
    return this.receivingMessageNumber;
  }
}

/**
 * Сессия шифрования для конкретного чата
 */
export interface RatchetSession {
  chatId: string;
  ratchet: DoubleRatchet;
  theirIdentityKey: Uint8Array;
  theirCurrentEphemeralKey?: Uint8Array;
  ourEphemeralKeyPair?: { publicKey: Uint8Array; privateKey: Uint8Array };
  createdAt: number;
  lastUsedAt: number;
}
