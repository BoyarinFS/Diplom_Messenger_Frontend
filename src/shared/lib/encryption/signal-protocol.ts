// Временно используем require для диагностики
const Signal = require('@privacyresearch/libsignal-protocol-typescript');

// Посмотрим, что внутри
console.log('Signal exports:', Object.keys(Signal));
console.log('Signal type:', typeof Signal);

import type { EncryptedPrivateKeys, KeyBundleRequest } from './types';

export class SignalProtocol {
  static async generateKeyBundle(password: string): Promise<{
    bundleRequest: KeyBundleRequest;
    encryptedKeys: EncryptedPrivateKeys;
  }> {
    console.log('🔑 Starting key generation...');
    
    // Проверим, как именно нужно получать KeyHelper
    console.log('Signal available:', !!Signal);
    
    // Возможно KeyHelper доступен через Signal.default или Signal.KeyHelper
    const KeyHelper = Signal.KeyHelper || (Signal.default && Signal.default.KeyHelper);
    console.log('KeyHelper found:', !!KeyHelper);
    
    if (!KeyHelper) {
      throw new Error('KeyHelper not found in Signal library. Exports: ' + Object.keys(Signal).join(', '));
    }
    
    const registrationId = KeyHelper.generateRegistrationId();
    console.log('registrationId:', registrationId);
    
    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, 1);
    
    // Генерируем 100 one-time prekeys
    const preKeys: any[] = [];
    const preKeyPublicStrings: string[] = [];
    for (let i = 1; i <= 100; i++) {
      const preKey = await KeyHelper.generatePreKey(i);
      preKeys.push(preKey);
      
      const pubKey = new Uint8Array(preKey.keyPair.pubKey);
      const base64PubKey = SignalProtocol.arrayToBase64(pubKey);
      preKeyPublicStrings.push(base64PubKey);
    }
    
    const bundleRequest: KeyBundleRequest = {
      registrationId,
      identityPublicKey: SignalProtocol.arrayToBase64(new Uint8Array(identityKeyPair.pubKey)),
      signedPreKeyPublic: SignalProtocol.arrayToBase64(new Uint8Array(signedPreKey.keyPair.pubKey)),
      signedPreKeySignature: SignalProtocol.arrayToBase64(new Uint8Array(signedPreKey.signature)),
      oneTimePreKeys: preKeyPublicStrings,
    };
    
    const privateKeys = {
      identityPrivateKey: new Uint8Array(identityKeyPair.privKey),
      signedPreKeyPrivate: new Uint8Array(signedPreKey.keyPair.privKey),
      preKeys: preKeys.map(k => new Uint8Array(k.keyPair.privKey)),
    };

    const encryptedKeys = await SignalProtocol.encryptPrivateKeys(privateKeys, password);

    return { bundleRequest, encryptedKeys };
  }

  static async encryptPrivateKeys(
    keys: { identityPrivateKey: Uint8Array; signedPreKeyPrivate: Uint8Array; preKeys: Uint8Array[] },
    password: string
  ): Promise<EncryptedPrivateKeys> {
    const key = await SignalProtocol.deriveKeyFromPassword(password);
    
    const encrypt = async (data: Uint8Array): Promise<string> => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      const dataCopy = new Uint8Array(data);
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        dataCopy
      );
      
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      return SignalProtocol.arrayToBase64(combined);
    };

    return {
      identityPrivateKey: await encrypt(keys.identityPrivateKey),
      signedPreKeyPrivate: await encrypt(keys.signedPreKeyPrivate),
      preKeys: await Promise.all(keys.preKeys.map(encrypt)),
    };
  }

  static async decryptPrivateKeys(
    encrypted: EncryptedPrivateKeys,
    password: string
  ): Promise<{
    identityPrivateKey: Uint8Array;
    signedPreKeyPrivate: Uint8Array;
    preKeys: Uint8Array[];
  }> {
    const key = await SignalProtocol.deriveKeyFromPassword(password);
    
    const decrypt = async (encryptedBase64: string): Promise<Uint8Array> => {
      const data = SignalProtocol.base64ToArray(encryptedBase64);
      const iv = data.slice(0, 12);
      const ciphertext = data.slice(12);
      
      const ciphertextCopy = new Uint8Array(ciphertext);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertextCopy
      );
      
      return new Uint8Array(decrypted);
    };

    return {
      identityPrivateKey: await decrypt(encrypted.identityPrivateKey),
      signedPreKeyPrivate: await decrypt(encrypted.signedPreKeyPrivate),
      preKeys: await Promise.all(encrypted.preKeys.map(decrypt)),
    };
  }

  private static async deriveKeyFromPassword(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    const passwordCopy = new Uint8Array(passwordData);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordCopy,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static arrayToBase64(array: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < array.byteLength; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
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