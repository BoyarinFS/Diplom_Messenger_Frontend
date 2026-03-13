import type { 
  KeyBundleRequest, 
  UserKeyBundle, 
  EncryptedPrivateKeys,
  PublicKeyBundle 
} from './types';
import nacl from 'tweetnacl';



const ONE_TIME_PRE_KEYS_COUNT = 50;
const X25519_KEY_LENGTH = 32;


export class SignalProtocolManager {
  private get crypto(): Crypto {
    if (typeof window === 'undefined') {
      throw new Error('SignalProtocolManager can only be used in browser environment');
    }
    return window.crypto;
  }

  async generateKeyBundle(password: string): Promise<{
    keyBundleRequest: KeyBundleRequest;
    encryptedPrivateKeys: EncryptedPrivateKeys;
    rawKeys: UserKeyBundle;
  }> {
    const identityKeyPair = this.generateX25519KeyPair();
    const signedPreKeyPair = this.generateX25519KeyPair();
    const signedPreKeySignature = this.signWithEd25519(
      identityKeyPair.privateKey,
      signedPreKeyPair.publicKey
    );
    const oneTimePreKeys = this.generateOneTimePreKeys(ONE_TIME_PRE_KEYS_COUNT);

    const encryptedPrivateKeys = await this.encryptPrivateKeys(
      {
        identityPrivateKey: identityKeyPair.privateKey,
        signedPreKeyPrivate: signedPreKeyPair.privateKey,
        oneTimePreKeys: oneTimePreKeys.map(k => k.privateKey),
      },
      password
    );

    const keyBundleRequest: KeyBundleRequest = {
      identityPublicKey: this.arrayBufferToBase64(identityKeyPair.publicKey),
      identityPrivateKey: encryptedPrivateKeys.identityPrivateKey,
      signedPreKeyPublic: this.arrayBufferToBase64(signedPreKeyPair.publicKey),
      signedPreKeyPrivate: encryptedPrivateKeys.signedPreKeyPrivate,
      signedPreKeySignature: this.arrayBufferToBase64(signedPreKeySignature),
      oneTimePreKeys: oneTimePreKeys.map(k => this.arrayBufferToBase64(k.publicKey)),
    };

    const rawKeys: UserKeyBundle = {
      identityKeyPair,
      signedPreKeyPair,
      signedPreKeySignature,
      oneTimePreKeys: oneTimePreKeys.map((k, i) => ({
        id: i,
        publicKey: k.publicKey,
        privateKey: k.privateKey,
      })),
    };

    return {
      keyBundleRequest,
      encryptedPrivateKeys,
      rawKeys,
    };
  }

  private generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
    const keyPair = nacl.box.keyPair();
    return { 
      publicKey: keyPair.publicKey, 
      privateKey: keyPair.secretKey 
    };
  }


  private signWithEd25519(
    privateKey: Uint8Array, 
    data: Uint8Array
  ): Uint8Array {
    const signKeyPair = nacl.sign.keyPair.fromSeed(privateKey);
    const signature = nacl.sign.detached(data, signKeyPair.secretKey);
    return signature;
  }



  private generateOneTimePreKeys(count: number): Array<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const keys = [];
    for (let i = 0; i < count; i++) {
      keys.push(this.generateX25519KeyPair());
    }
    return keys;
  }


  private async encryptPrivateKeys(
    keys: {
      identityPrivateKey: Uint8Array;
      signedPreKeyPrivate: Uint8Array;
      oneTimePreKeys: Uint8Array[];
    },
    password: string
  ): Promise<EncryptedPrivateKeys> {
    const salt = this.crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await this.deriveKeyFromPassword(password, salt);
    const encryptedIdentity = await this.encryptWithAes(keys.identityPrivateKey, keyMaterial);
    const encryptedSignedPreKey = await this.encryptWithAes(keys.signedPreKeyPrivate, keyMaterial);
    const oneTimeKeysConcatenated = this.concatArrays(keys.oneTimePreKeys);
    const encryptedOneTimeKeys = await this.encryptWithAes(oneTimeKeysConcatenated, keyMaterial);

    return {
      identityPrivateKey: this.arrayBufferToBase64(
        this.concatArrays([salt, encryptedIdentity])
      ),
      signedPreKeyPrivate: this.arrayBufferToBase64(
        this.concatArrays([salt, encryptedSignedPreKey])
      ),
      oneTimePreKeys: [this.arrayBufferToBase64(
        this.concatArrays([salt, encryptedOneTimeKeys])
      )],
    };
  }

  async decryptPrivateKeys(
    encryptedKeys: EncryptedPrivateKeys,
    password: string
  ): Promise<{
    identityPrivateKey: Uint8Array;
    signedPreKeyPrivate: Uint8Array;
    oneTimePreKeys: Uint8Array[];
  }> {
    const identityData = this.base64ToArray(encryptedKeys.identityPrivateKey);
    
    console.log('🔍 decryptPrivateKeys: identityData length =', identityData.length);
    
    let identityPrivateKey: Uint8Array;
    let signedPreKeyPrivate: Uint8Array;
    let keyMaterial: CryptoKey | null = null;
    
    if (identityData.length >= 48) {
      try {
        const salt = identityData.slice(0, 16);
        const encryptedIdentity = identityData.slice(16);
        
        keyMaterial = await this.deriveKeyFromPassword(password, salt);
        identityPrivateKey = await this.decryptWithAes(encryptedIdentity, keyMaterial);
        console.log('✅ Decrypted identity key successfully');
      } catch (e) {
        console.warn('⚠️ Failed to decrypt identity key, using as plaintext:', e);
        identityPrivateKey = identityData;
      }
    } else {
      console.warn('⚠️ Key data too small for encryption, using as plaintext');
      identityPrivateKey = identityData;
    }
    
    const signedPreKeyData = this.base64ToArray(encryptedKeys.signedPreKeyPrivate);
    console.log('🔍 decryptPrivateKeys: signedPreKeyData length =', signedPreKeyData.length);
    
    if (signedPreKeyData.length >= 28) {
      try {
        const salt = signedPreKeyData.slice(0, 16);
        const keyMaterialForSigned = await this.deriveKeyFromPassword(password, salt);
        signedPreKeyPrivate = await this.decryptWithAes(
          signedPreKeyData.slice(16),
          keyMaterialForSigned
        );
        console.log('✅ Decrypted signedPreKey successfully');
      } catch (e) {
        console.warn('⚠️ Failed to decrypt signedPreKey, trying as plaintext:', e);
        signedPreKeyPrivate = signedPreKeyData;
      }
    } else {
      signedPreKeyPrivate = signedPreKeyData;
    }

    let oneTimePreKeys: Uint8Array[] = [];
    if (encryptedKeys.oneTimePreKeys && encryptedKeys.oneTimePreKeys.length > 0 && keyMaterial) {
      try {
        const oneTimeKeysData = this.base64ToArray(encryptedKeys.oneTimePreKeys[0]);
        if (oneTimeKeysData.length >= 48) {
          const decryptedOneTime = await this.decryptWithAes(oneTimeKeysData.slice(16), keyMaterial);
          oneTimePreKeys = this.splitArray(decryptedOneTime, X25519_KEY_LENGTH);
        }
      } catch (e) {
        console.warn('⚠️ Failed to decrypt oneTimePreKeys:', e);
      }
    }

    return {
      identityPrivateKey,
      signedPreKeyPrivate,
      oneTimePreKeys,
    };
  }



  private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const keyMaterial = await this.crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return this.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private async encryptWithAes(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await this.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer as ArrayBuffer,
      },
      key,
      data.buffer as ArrayBuffer
    );
    return this.concatArrays([iv, new Uint8Array(ciphertext)]);
  }

  private async decryptWithAes(encryptedData: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
    const iv = encryptedData.slice(0, 12);
    const ciphertext = encryptedData.slice(12);
    const decrypted = await this.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );
    return new Uint8Array(decrypted);
  }

  private arrayBufferToBase64(buffer: Uint8Array | ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private concatArrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  private splitArray(array: Uint8Array, chunkSize: number): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

let signalProtocolInstance: SignalProtocolManager | null = null;

export function getSignalProtocol(): SignalProtocolManager {
  if (!signalProtocolInstance) {
    signalProtocolInstance = new SignalProtocolManager();
  }
  return signalProtocolInstance;
}

export const signalProtocol = {
  generateKeyBundle: (password: string) => getSignalProtocol().generateKeyBundle(password),
  decryptPrivateKeys: (encryptedKeys: EncryptedPrivateKeys, password: string) => 
    getSignalProtocol().decryptPrivateKeys(encryptedKeys, password),
};
