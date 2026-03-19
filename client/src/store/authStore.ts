import { create } from 'zustand';
import { generateKeyPair, keyToString, stringToKey, exportEncryptedKeyBackup, importEncryptedKeyBackup, EncryptedKeyBackup } from '../crypto';
import { keyManager } from '../crypto/keyManager';
import api from '../utils/api';

interface AuthState {
  username: string | null;
  sessionToken: string | null;
  publicKey: Uint8Array | null;
  secretKey: Uint8Array | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<{ backupKeys: EncryptedKeyBackup }>;
  logout: () => void;
  restoreKeys: (backup: EncryptedKeyBackup, password: string) => boolean;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  username: null,
  sessionToken: null,
  publicKey: null,
  secretKey: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api<{ token: string; publicKey?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        skipAuth: true,
      });

      sessionStorage.setItem('polarchat_token', response.token);

      // Generate a new keypair for this session.
      // In production, keys would be restored from an encrypted backup.
      const keyPair = generateKeyPair();
      keyManager.setIdentityKeyPair(keyPair);

      // Register the session public key with the server so peers can encrypt messages to us
      await api('/auth/keys', {
        method: 'PUT',
        body: JSON.stringify({ publicKey: keyToString(keyPair.publicKey) }),
      });

      set({
        username,
        sessionToken: response.token,
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      // Generate keys entirely on the client
      const keyPair = generateKeyPair();
      keyManager.setIdentityKeyPair(keyPair);

      const response = await api<{ token: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          publicKey: keyToString(keyPair.publicKey),
        }),
        skipAuth: true,
      });

      sessionStorage.setItem('polarchat_token', response.token);

      // Create encrypted backup of keys
      const backupKeys = exportEncryptedKeyBackup(keyPair, password);

      set({
        username,
        sessionToken: response.token,
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey,
        isAuthenticated: true,
        isLoading: false,
      });

      return { backupKeys };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    sessionStorage.removeItem('polarchat_token');
    keyManager.clearAll();
    set({
      username: null,
      sessionToken: null,
      publicKey: null,
      secretKey: null,
      isAuthenticated: false,
      error: null,
    });
  },

  restoreKeys: (backup: EncryptedKeyBackup, password: string) => {
    try {
      const keyPair = importEncryptedKeyBackup(backup, password);
      keyManager.setIdentityKeyPair(keyPair);
      set({
        publicKey: keyPair.publicKey,
        secretKey: keyPair.secretKey,
      });
      return true;
    } catch {
      set({ error: 'Failed to restore keys - wrong password or corrupted backup' });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
