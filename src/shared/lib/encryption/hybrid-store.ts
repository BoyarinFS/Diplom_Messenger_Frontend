// @ts-ignore
const Signal = require('@privacyresearch/libsignal-protocol-typescript');
import { keyStorage } from './key-storage';
import { SignalProtocol } from './signal-protocol';
import type { DecryptedKeyBundle } from './types';

export interface SignalProtocolStore {
  loadSession(identifier: string): Promise<any | null>;
  storeSession(identifier: string, record: any): Promise<void>;
  getIdentityKeyPair(): Promise<any>;
  getLocalRegistrationId(): Promise<number>;
  isTrustedIdentity(identifier: string, identityKey: Uint8Array, direction: any): Promise<boolean>;
  saveIdentity(identifier: string, identityKey: Uint8Array): Promise<boolean>;
  loadPreKey(keyId: number): Promise<any>;
  storePreKey(keyId: number, record: any): Promise<void>;
  removePreKey(keyId: number): Promise<void>;
  loadSignedPreKey(keyId: number): Promise<any>;
  storeSignedPreKey(keyId: number, record: any): Promise<void>;
  removeSignedPreKey(keyId: number): Promise<void>;
}

export class SignalProtocolStoreImpl implements SignalProtocolStore {
  private sessions: Map<string, any> = new Map();
  private preKeys: Map<number, any> = new Map();
  private signedPreKey: any;
  private identityKeyPair: any;
  private registrationId: number;

  constructor(bundle: DecryptedKeyBundle) {
    this.identityKeyPair = bundle.identityKeyPair;
    this.signedPreKey = bundle.signedPreKey;
    this.registrationId = bundle.registrationId;

    bundle.preKeys.forEach((preKey, index) => {
      const keyId = index + 1;
      this.preKeys.set(keyId, preKey);
    });
  }

  async loadSession(identifier: string): Promise<any | null> {
    if (this.sessions.has(identifier)) {
      return this.sessions.get(identifier) || null;
    }

    const chatId = identifier.split(':')[0];
    const stored = await keyStorage.getSessionRecord(chatId);
    if (!stored) return null;

    try {
      const recordBytes = SignalProtocol.base64ToArray(stored);
      this.sessions.set(identifier, recordBytes);
      return recordBytes;
    } catch (e) {
      console.warn('Failed to deserialize session record:', e);
      return null;
    }
  }

  async storeSession(identifier: string, record: any): Promise<void> {
    this.sessions.set(identifier, record);

    const chatId = identifier.split(':')[0];
    let bytes: Uint8Array;

    if (record instanceof Uint8Array) {
      bytes = record;
    } else if (record && typeof record.serialize === 'function') {
      bytes = record.serialize();
    } else if (ArrayBuffer.isView(record)) {
      bytes = new Uint8Array(record.buffer, record.byteOffset, record.byteLength);
    } else {
      bytes = new Uint8Array(record);
    }

    await keyStorage.saveSessionRecord(chatId, bytes);
  }

  async getIdentityKeyPair(): Promise<any> {
    return this.identityKeyPair;
  }

  async getLocalRegistrationId(): Promise<number> {
    return this.registrationId;
  }

  async isTrustedIdentity(
    identifier: string,
    identityKey: Uint8Array,
    direction: any
  ): Promise<boolean> {
    return true;
  }

  async saveIdentity(
    identifier: string,
    identityKey: Uint8Array
  ): Promise<boolean> {
    return true;
  }

  async loadPreKey(keyId: number): Promise<any> {
    const record = this.preKeys.get(keyId);
    if (!record) throw new Error(`PreKey ${keyId} not found`);
    return record;
  }

  async storePreKey(keyId: number, record: any): Promise<void> {
    this.preKeys.set(keyId, record);
  }

  async removePreKey(keyId: number): Promise<void> {
    this.preKeys.delete(keyId);
  }

  async loadSignedPreKey(keyId: number): Promise<any> {
    if (!this.signedPreKey) {
      throw new Error('SignedPreKey not found');
    }
    return this.signedPreKey;
  }

  async storeSignedPreKey(keyId: number, record: any): Promise<void> {
    this.signedPreKey = record;
  }

  async removeSignedPreKey(keyId: number): Promise<void> {
    this.signedPreKey = null;
  }
}