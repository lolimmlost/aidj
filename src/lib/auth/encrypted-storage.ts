// This file has been disabled as part of undoing NFR2 (Encrypted Credential Storage)
// The functionality has been reverted to use config-based storage instead of encrypted storage
// This file is kept for reference but should not be used in production

/**
 * @deprecated This encrypted storage implementation has been disabled as part of NFR2 reversal.
 * Use config-based storage instead.
 */
export const EncryptedSessionStorage = class {
  static getInstance() {
    console.warn('EncryptedSessionStorage is deprecated. Use config-based storage instead.');
    return new EncryptedSessionStorage();
  }

  async setApiKey(service: string) {
    console.warn(`setApiKey for ${service} is deprecated. Use config-based storage instead.`);
    return { success: false, message: 'Encrypted storage disabled' };
  }

  async getApiKey(service: string) {
    console.warn(`getApiKey for ${service} is deprecated. Use config-based storage instead.`);
    return { apiKey: null };
  }

  async removeApiKey(service: string) {
    console.warn(`removeApiKey for ${service} is deprecated. Use config-based storage instead.`);
    return { success: false, message: 'Encrypted storage disabled' };
  }
};

// Export disabled instance
export const encryptedStorage = EncryptedSessionStorage.getInstance();

// Export disabled functions for backward compatibility
export const $setApiKey = async () => {
  console.warn('$setApiKey is deprecated. Use config-based storage instead.');
  return { success: false, message: 'Encrypted storage disabled' };
};

export const $getApiKey = async () => {
  console.warn('$getApiKey is deprecated. Use config-based storage instead.');
  return { apiKey: null };
};

export const $removeApiKey = async () => {
  console.warn('$removeApiKey is deprecated. Use config-based storage instead.');
  return { success: false, message: 'Encrypted storage disabled' };
};