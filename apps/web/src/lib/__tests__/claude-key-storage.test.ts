import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsTauriEnvironment = vi.fn();
const mockGetSecureClaudeApiKey = vi.fn();
const mockSetSecureClaudeApiKey = vi.fn();
const mockClearSecureClaudeApiKey = vi.fn();

vi.mock('../tauri-bridge', () => ({
  isTauriEnvironment: mockIsTauriEnvironment,
  getSecureClaudeApiKey: mockGetSecureClaudeApiKey,
  setSecureClaudeApiKey: mockSetSecureClaudeApiKey,
  clearSecureClaudeApiKey: mockClearSecureClaudeApiKey,
}));

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.has(key) ? this.values.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('claude-key-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriEnvironment.mockReturnValue(false);
    mockGetSecureClaudeApiKey.mockResolvedValue(null);
    mockSetSecureClaudeApiKey.mockResolvedValue(true);
    mockClearSecureClaudeApiKey.mockResolvedValue(true);
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  it('loads key from secure storage in Tauri', async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    mockGetSecureClaudeApiKey.mockResolvedValue('sk-ant-123');
    const { loadClaudeApiKeyFromSecureStorage } = await import('../claude-key-storage');

    await expect(loadClaudeApiKeyFromSecureStorage()).resolves.toBe('sk-ant-123');
  });

  it('saves non-empty keys to secure storage and clears empty keys', async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    const { saveClaudeApiKeyToSecureStorage } = await import('../claude-key-storage');

    await expect(saveClaudeApiKeyToSecureStorage('  sk-ant-123  ')).resolves.toBe(true);
    expect(mockSetSecureClaudeApiKey).toHaveBeenCalledWith('sk-ant-123');

    await expect(saveClaudeApiKeyToSecureStorage('   ')).resolves.toBe(true);
    expect(mockClearSecureClaudeApiKey).toHaveBeenCalledOnce();
  });

  it('migrates legacy localStorage key to secure storage and scrubs plaintext', async () => {
    mockIsTauriEnvironment.mockReturnValue(true);
    const { migrateLegacyClaudeApiKeyFromLocalStorage } = await import('../claude-key-storage');

    const localStorage = new MemoryStorage();
    localStorage.setItem(
      'inkwell-settings',
      JSON.stringify({
        state: { theme: 'dark', claudeApiKey: ' sk-ant-legacy ' },
        version: 0,
      }),
    );

    // @ts-expect-error test shim
    globalThis.window = { localStorage };

    await migrateLegacyClaudeApiKeyFromLocalStorage();

    expect(mockSetSecureClaudeApiKey).toHaveBeenCalledWith('sk-ant-legacy');
    const updated = localStorage.getItem('inkwell-settings');
    expect(updated).not.toBeNull();
    const parsed = JSON.parse(updated!);
    expect(parsed.state.claudeApiKey).toBeUndefined();
    expect(parsed.state.theme).toBe('dark');
  });
});
