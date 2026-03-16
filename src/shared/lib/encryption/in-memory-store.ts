import * as Signal from '@signalapp/libsignal-client';

export class InMemorySessionStore implements Signal.SessionStore {
  private sessions = new Map<string, Signal.SessionRecord>();

  async saveSession(name: Signal.ProtocolAddress, record: Signal.SessionRecord): Promise<void> {
    const key = `${name.name()}:${name.deviceId()}`;
    this.sessions.set(key, record);
  }

  async getSession(name: Signal.ProtocolAddress): Promise<Signal.SessionRecord | null> {
    const key = `${name.name()}:${name.deviceId()}`;
    return this.sessions.get(key) || null;
  }

  async getExistingSessions(names: Signal.ProtocolAddress[]): Promise<Signal.SessionRecord[]> {
    const records: Signal.SessionRecord[] = [];
    for (const name of names) {
      const key = `${name.name()}:${name.deviceId()}`;
      const record = this.sessions.get(key);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }
}
