const Signal = require('@privacyresearch/libsignal-protocol-typescript');
import { SignalProtocolStoreImpl, SignalProtocolStore } from './hybrid-store';
import { SignalProtocol } from './signal-protocol';
import type { ReceiverKeys, DecryptedKeyBundle } from './types';

export class SessionManager {
  private store: SignalProtocolStore;

  constructor(decryptedBundle: DecryptedKeyBundle) {
    this.store = new SignalProtocolStoreImpl(decryptedBundle);
  }

  static async loadOrCreate(chatId: string, bundle: DecryptedKeyBundle): Promise<SessionManager> {
    return new SessionManager(bundle);
  }

  async createOutgoingSession(chatId: string, theirKeys: ReceiverKeys): Promise<void> {
    const SignalProtocolAddress = Signal.SignalProtocolAddress;
    const SessionBuilder = Signal.SessionBuilder;
    const PreKeyBundle = Signal.PreKeyBundle;
    
    const address = new SignalProtocolAddress(chatId, 1);
    const builder = new SessionBuilder(this.store, address);
    
    const preKeyBundle = new PreKeyBundle(
      theirKeys.registrationId,
      1,
      theirKeys.oneTimePreKey ? 1 : null,
      theirKeys.oneTimePreKey 
        ? SignalProtocol.base64ToArray(theirKeys.oneTimePreKey)
        : null,
      1,
      SignalProtocol.base64ToArray(theirKeys.signedPreKeyPublic),
      SignalProtocol.base64ToArray(theirKeys.signedPreKeySignature),
      SignalProtocol.base64ToArray(theirKeys.identityPublicKey)
    );
    
    await builder.processPreKey(preKeyBundle);
  }

  async encrypt(chatId: string, plaintext: string): Promise<string> {
    const SignalProtocolAddress = Signal.SignalProtocolAddress;
    const SessionCipher = Signal.SessionCipher;
    
    const address = new SignalProtocolAddress(chatId, 1);
    const cipher = new SessionCipher(this.store, address);
    
    const ciphertext = await cipher.encrypt(plaintext);
    
    return JSON.stringify({
      type: ciphertext.type,
      body: SignalProtocol.arrayToBase64(new Uint8Array(ciphertext.body)),
    });
  }

  async decrypt(chatId: string, encryptedData: string): Promise<string> {
    const SignalProtocolAddress = Signal.SignalProtocolAddress;
    const SessionCipher = Signal.SessionCipher;
    
    const parsed = JSON.parse(encryptedData);
    const address = new SignalProtocolAddress(chatId, 1);
    const cipher = new SessionCipher(this.store, address);
    
    const messageBytes = SignalProtocol.base64ToArray(parsed.body);
    
    let plaintext: string;
    
    if (parsed.type === 3) {
      plaintext = await cipher.decryptPreKey(messageBytes);
    } else {
      plaintext = await cipher.decrypt(messageBytes);
    }

    return plaintext;
  }

  async hasSession(chatId: string): Promise<boolean> {
    const SignalProtocolAddress = Signal.SignalProtocolAddress;
    const address = new SignalProtocolAddress(chatId, 1);
    const session = await this.store.loadSession(address.toString());
    return session !== null;
  }
}