'use client';

/**
 * SettingsModal Component
 *
 * Tabbed modal for managing all user settings: Appearance, Editor,
 * AI, Data & Privacy, and About. All settings except API key apply
 * immediately on change. Persisted via the settings store (localStorage).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useSettingsStore,
  FONT_FAMILY_MAP,
  FONT_SIZE_MAP,
  EDITOR_WIDTH_MAP,
} from '@/lib/settings-store';
import type {
  ThemeMode,
  EditorFontFamily,
  EditorFontSize,
  EditorWidth,
  AIAuthMethod,
  GhostTextDelay,
  AutoSaveInterval,
} from '@/lib/settings-store';
import { useDocumentStore } from '@/lib/document-store';
import { editorJsonToMarkdown } from '@/lib/markdown-export';
import { destroyDocumentAI } from '@/lib/document-ai-instance';
import { saveClaudeApiKeyToSecureStorage } from '@/lib/claude-key-storage';
import {
  completeClaudeSubscriptionSignIn,
  getClaudeAuthStatus,
  isTauriEnvironment,
  onClaudeAuthCallback,
  signOutClaudeSubscription,
  startClaudeSubscriptionSignIn,
} from '@/lib/tauri-bridge';
import {
  CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED,
  sanitizeAuthErrorMessage,
} from '@/lib/ai-auth';

type TabId = 'appearance' | 'editor' | 'ai' | 'data' | 'about';

const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Editor' },
  { id: 'ai', label: 'AI' },
  { id: 'data', label: 'Data' },
  { id: 'about', label: 'About' },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('appearance');
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Focus trap: focus modal on open
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="inkwell-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="inkwell-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
      >
        <div className="inkwell-modal-header">
          <span className="inkwell-modal-title">Settings</span>
          <button
            className="inkwell-modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="inkwell-modal-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`inkwell-modal-tab ${activeTab === tab.id ? 'inkwell-modal-tab-active' : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="inkwell-modal-body" role="tabpanel">
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'editor' && <EditorTab />}
          {activeTab === 'ai' && <AITab />}
          {activeTab === 'data' && <DataTab />}
          {activeTab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  );
}

// ── Appearance Tab ──

function AppearanceTab() {
  const {
    theme, setTheme,
    editorFontFamily, setEditorFontFamily,
    editorFontSize, setEditorFontSize,
    editorWidth, setEditorWidth,
  } = useSettingsStore();

  return (
    <>
      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Theme</div>
        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Color theme</div>
            <div className="inkwell-setting-desc">Choose light, dark, or match your system</div>
          </div>
          <div className="inkwell-theme-group">
            {(['light', 'system', 'dark'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                className={`inkwell-theme-option ${theme === mode ? 'inkwell-theme-option-active' : ''}`}
                onClick={() => setTheme(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Editor</div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Font family</div>
          <select
            className="inkwell-setting-select"
            value={editorFontFamily}
            onChange={(e) => setEditorFontFamily(e.target.value as EditorFontFamily)}
          >
            <option value="system">System Default</option>
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans-serif</option>
            <option value="mono">Monospace</option>
          </select>
        </div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Font size</div>
          <select
            className="inkwell-setting-select"
            value={editorFontSize}
            onChange={(e) => setEditorFontSize(e.target.value as EditorFontSize)}
          >
            <option value="small">Small (14px)</option>
            <option value="default">Default (18px)</option>
            <option value="large">Large (20px)</option>
            <option value="xl">Extra Large (24px)</option>
          </select>
        </div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Content width</div>
          <select
            className="inkwell-setting-select"
            value={editorWidth}
            onChange={(e) => setEditorWidth(e.target.value as EditorWidth)}
          >
            <option value="narrow">Narrow (640px)</option>
            <option value="default">Default (896px)</option>
            <option value="wide">Wide (1152px)</option>
            <option value="full">Full width</option>
          </select>
        </div>
      </div>
    </>
  );
}

// ── Editor Tab ──

function EditorTab() {
  const {
    autoSaveEnabled, setAutoSaveEnabled,
    autoSaveIntervalMs, setAutoSaveIntervalMs,
    spellCheck, setSpellCheck,
    showWordCount, setShowWordCount,
    showCharCount, setShowCharCount,
  } = useSettingsStore();

  return (
    <>
      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Auto-save</div>

        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Auto-save documents</div>
            <div className="inkwell-setting-desc">Automatically save changes at regular intervals</div>
          </div>
          <button
            className={`inkwell-toggle ${autoSaveEnabled ? 'inkwell-toggle-active' : ''}`}
            onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
            role="switch"
            aria-checked={autoSaveEnabled}
            aria-label="Auto-save"
          />
        </div>

        {autoSaveEnabled && (
          <div className="inkwell-setting-row">
            <div className="inkwell-setting-label">Save interval</div>
            <select
              className="inkwell-setting-select"
              value={autoSaveIntervalMs}
              onChange={(e) => setAutoSaveIntervalMs(Number(e.target.value) as AutoSaveInterval)}
            >
              <option value={10_000}>10 seconds</option>
              <option value={30_000}>30 seconds</option>
              <option value={60_000}>1 minute</option>
              <option value={120_000}>2 minutes</option>
              <option value={300_000}>5 minutes</option>
            </select>
          </div>
        )}
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Display</div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Spell check</div>
          <button
            className={`inkwell-toggle ${spellCheck ? 'inkwell-toggle-active' : ''}`}
            onClick={() => setSpellCheck(!spellCheck)}
            role="switch"
            aria-checked={spellCheck}
            aria-label="Spell check"
          />
        </div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Show word count</div>
          <button
            className={`inkwell-toggle ${showWordCount ? 'inkwell-toggle-active' : ''}`}
            onClick={() => setShowWordCount(!showWordCount)}
            role="switch"
            aria-checked={showWordCount}
            aria-label="Show word count"
          />
        </div>

        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Show character count</div>
          <button
            className={`inkwell-toggle ${showCharCount ? 'inkwell-toggle-active' : ''}`}
            onClick={() => setShowCharCount(!showCharCount)}
            role="switch"
            aria-checked={showCharCount}
            aria-label="Show character count"
          />
        </div>
      </div>
    </>
  );
}

// ── AI Tab ──

function AITab() {
  const aiAuthMethod = useSettingsStore((s) => s.aiAuthMethod);
  const setAiAuthMethod = useSettingsStore((s) => s.setAiAuthMethod);
  const claudeApiKey = useSettingsStore((s) => (typeof s.claudeApiKey === 'string' ? s.claudeApiKey : ''));
  const setClaudeApiKey = useSettingsStore((s) => s.setClaudeApiKey);
  const claudeSubscriptionSupported = useSettingsStore((s) => s.claudeSubscriptionSupported);
  const claudeSubscriptionConnected = useSettingsStore((s) => s.claudeSubscriptionConnected);
  const setClaudeSubscriptionStatus = useSettingsStore((s) => s.setClaudeSubscriptionStatus);
  const ghostTextEnabled = useSettingsStore((s) => Boolean(s.ghostTextEnabled));
  const setGhostTextEnabled = useSettingsStore((s) => s.setGhostTextEnabled);
  const ghostTextDebounceMs = useSettingsStore((s) =>
    s.ghostTextDebounceMs === 300 || s.ghostTextDebounceMs === 500 || s.ghostTextDebounceMs === 800
      ? s.ghostTextDebounceMs
      : 500,
  );
  const setGhostTextDebounceMs = useSettingsStore((s) => s.setGhostTextDebounceMs);

  const [localKey, setLocalKey] = useState<string>(claudeApiKey);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyChanged = localKey !== claudeApiKey;

  const authStateLabel = !claudeSubscriptionSupported
    ? 'Unsupported'
    : claudeSubscriptionConnected
      ? 'Connected'
      : 'Disconnected';

  useEffect(() => {
    setLocalKey(claudeApiKey);
  }, [claudeApiKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isTauriEnvironment()) return;
    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function syncAuthStatus() {
      const status = await getClaudeAuthStatus();
      if (!mounted || !status) return;
      setClaudeSubscriptionStatus({
        supported: status.supported && CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED,
        connected: status.connected,
      });
      if (status.message) {
        setAuthMessage(sanitizeAuthErrorMessage(status.message));
      }
    }

    void syncAuthStatus();

    void onClaudeAuthCallback(async (callbackUrl) => {
      setAuthBusy(true);
      try {
        const status = await completeClaudeSubscriptionSignIn(callbackUrl);
        if (!status) {
          setAuthMessage('Claude sign-in callback could not be completed.');
          return;
        }
        setClaudeSubscriptionStatus({
          supported: status.supported && CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED,
          connected: status.connected,
        });
        setAuthMessage(status.message ? sanitizeAuthErrorMessage(status.message) : null);
        if (status.connected) {
          setAiAuthMethod('claude_subscription');
          destroyDocumentAI();
        }
      } finally {
        setAuthBusy(false);
      }
    }).then((listener) => {
      unlisten = listener;
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [setAiAuthMethod, setClaudeSubscriptionStatus]);

  const handleSaveKey = useCallback(async () => {
    const trimmed = localKey.trim();
    setSaveError(null);
    setSaving(true);

    try {
      if (isTauriEnvironment()) {
        const persisted = await saveClaudeApiKeyToSecureStorage(trimmed);
        if (!persisted) {
          setSaveError('Failed to update secure API key storage.');
          return;
        }
      }

      setClaudeApiKey(trimmed);
      // Re-initialize the AI service with the new key
      destroyDocumentAI();
      setSaved(true);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [localKey, setClaudeApiKey]);

  const handleConnectClaude = useCallback(async () => {
    if (!isTauriEnvironment()) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const started = await startClaudeSubscriptionSignIn();
      if (!started?.started) {
        setAuthMessage(
          sanitizeAuthErrorMessage(started?.message ?? 'Claude account sign-in is unavailable.'),
        );
      } else if (started.message) {
        setAuthMessage(sanitizeAuthErrorMessage(started.message));
      }
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const handleDisconnectClaude = useCallback(async () => {
    setAuthBusy(true);
    try {
      const ok = await signOutClaudeSubscription();
      if (!ok) {
        setAuthMessage('Unable to disconnect Claude account.');
        return;
      }
      setClaudeSubscriptionStatus({ supported: claudeSubscriptionSupported, connected: false });
      if (aiAuthMethod === 'claude_subscription') {
        setAiAuthMethod('api_key');
      }
      destroyDocumentAI();
      setAuthMessage('Claude account disconnected.');
    } finally {
      setAuthBusy(false);
    }
  }, [aiAuthMethod, claudeSubscriptionSupported, setAiAuthMethod, setClaudeSubscriptionStatus]);

  return (
    <>
      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">API Configuration</div>

        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Auth method</div>
            <div className="inkwell-setting-desc">Choose how Claude requests are authenticated.</div>
          </div>
          <select
            className="inkwell-setting-select"
            value={aiAuthMethod}
            onChange={(e) => {
              const method = e.target.value as AIAuthMethod;
              setAiAuthMethod(method);
              destroyDocumentAI();
            }}
          >
            <option value="api_key">API Key</option>
            <option
              value="claude_subscription"
              disabled={!claudeSubscriptionSupported || !claudeSubscriptionConnected}
            >
              Claude Account
            </option>
          </select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <div className="inkwell-setting-label" style={{ marginBottom: '0.375rem' }}>Claude API Key</div>
          <div className="inkwell-setting-desc" style={{ marginBottom: '0.5rem' }}>
            Inkwell uses Anthropic API access. This overrides the NEXT_PUBLIC_CLAUDE_API_KEY environment variable.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type={showKey ? 'text' : 'password'}
              className="inkwell-setting-input"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              placeholder="sk-ant-..."
              aria-label="Claude API key"
            />
            <button
              className="inkwell-btn-secondary"
              onClick={() => setShowKey(!showKey)}
              style={{ whiteSpace: 'nowrap', padding: '0.375rem 0.625rem' }}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
            <button
              className="inkwell-btn-primary"
              onClick={() => {
                void handleSaveKey();
              }}
              disabled={!keyChanged || saving}
              style={{ whiteSpace: 'nowrap' }}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
            </button>
          </div>
          {saveError && (
            <div className="inkwell-setting-desc" style={{ color: '#dc2626', marginTop: '0.5rem' }}>
              {saveError}
            </div>
          )}
        </div>

        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Claude account sign-in</div>
            <div className="inkwell-setting-desc">
              State: {authStateLabel}
              {!claudeSubscriptionSupported && ' — this desktop build has sign-in disabled.'}
            </div>
          </div>
          {claudeSubscriptionConnected ? (
            <button
              className="inkwell-btn-secondary"
              onClick={() => {
                void handleDisconnectClaude();
              }}
              disabled={authBusy}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="inkwell-btn-secondary"
              onClick={() => {
                void handleConnectClaude();
              }}
              disabled={authBusy || !claudeSubscriptionSupported}
            >
              {authBusy ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
        {authMessage && (
          <div className="inkwell-setting-desc" style={{ marginTop: '0.5rem' }}>
            {authMessage}
          </div>
        )}
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Inline Suggestions</div>

        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Ghost text suggestions</div>
            <div className="inkwell-setting-desc">Show AI-powered inline completions as you type</div>
          </div>
          <button
            className={`inkwell-toggle ${ghostTextEnabled ? 'inkwell-toggle-active' : ''}`}
            onClick={() => setGhostTextEnabled(!ghostTextEnabled)}
            role="switch"
            aria-checked={ghostTextEnabled}
            aria-label="Ghost text suggestions"
          />
        </div>

        {ghostTextEnabled && (
          <div className="inkwell-setting-row">
            <div className="inkwell-setting-label">Suggestion delay</div>
            <select
              className="inkwell-setting-select"
              value={ghostTextDebounceMs}
              onChange={(e) => setGhostTextDebounceMs(Number(e.target.value) as GhostTextDelay)}
            >
              <option value={300}>Fast (300ms)</option>
              <option value={500}>Default (500ms)</option>
              <option value={800}>Slow (800ms)</option>
            </select>
          </div>
        )}
      </div>
    </>
  );
}

// ── Data Tab ──

function DataTab() {
  const { documents } = useDocumentStore();
  const [confirmClear, setConfirmClear] = useState(false);

  const activeDocuments = documents.filter((d) => d.deletedAt === null);

  const handleExportAll = useCallback(() => {
    const parts: string[] = [];
    for (const doc of activeDocuments) {
      const md = editorJsonToMarkdown(doc.content);
      parts.push(`# ${doc.title}\n\n${md}\n\n---\n`);
    }
    const blob = new Blob([parts.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inkwell-export.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [activeDocuments]);

  const handleClearAll = useCallback(async () => {
    // Delete all documents from IndexedDB
    const store = useDocumentStore.getState();
    for (const doc of documents) {
      await store.permanentDelete(doc.id);
    }
    setConfirmClear(false);
  }, [documents]);

  return (
    <>
      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Export</div>
        <div className="inkwell-setting-row">
          <div>
            <div className="inkwell-setting-label">Export all documents</div>
            <div className="inkwell-setting-desc">
              Download all {activeDocuments.length} document{activeDocuments.length !== 1 ? 's' : ''} as a single Markdown file
            </div>
          </div>
          <button
            className="inkwell-btn-secondary"
            onClick={handleExportAll}
            disabled={activeDocuments.length === 0}
          >
            Export
          </button>
        </div>
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Danger Zone</div>
        <div className="inkwell-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div>
            <div className="inkwell-setting-label">Delete all documents</div>
            <div className="inkwell-setting-desc">
              Permanently delete all documents including trash. This cannot be undone.
            </div>
          </div>
          {!confirmClear ? (
            <button
              className="inkwell-btn-danger"
              onClick={() => setConfirmClear(true)}
              disabled={documents.length === 0}
              style={{ marginTop: '0.5rem' }}
            >
              Delete All Documents
            </button>
          ) : (
            <div className="inkwell-confirm-dialog">
              <span className="inkwell-confirm-text">Are you sure?</span>
              <button className="inkwell-btn-danger" onClick={handleClearAll}>
                Yes, delete all
              </button>
              <button className="inkwell-btn-secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── About Tab ──

function AboutTab() {
  const { resetAll, setClaudeApiKey } = useSettingsStore();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Application</div>
        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Inkwell</div>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>v0.0.1</span>
        </div>
        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Built with</div>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>Next.js, TipTap, Claude</span>
        </div>
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Keyboard Shortcuts</div>
        <table className="inkwell-shortcuts-table">
          <tbody>
            <tr>
              <td>Toggle sidebar</td>
              <td><kbd className="inkwell-kbd">Ctrl</kbd> + <kbd className="inkwell-kbd">\</kbd></td>
            </tr>
            <tr>
              <td>Bold</td>
              <td><kbd className="inkwell-kbd">Ctrl</kbd> + <kbd className="inkwell-kbd">B</kbd></td>
            </tr>
            <tr>
              <td>Italic</td>
              <td><kbd className="inkwell-kbd">Ctrl</kbd> + <kbd className="inkwell-kbd">I</kbd></td>
            </tr>
            <tr>
              <td>Underline</td>
              <td><kbd className="inkwell-kbd">Ctrl</kbd> + <kbd className="inkwell-kbd">U</kbd></td>
            </tr>
            <tr>
              <td>Accept ghost text</td>
              <td><kbd className="inkwell-kbd">Tab</kbd></td>
            </tr>
            <tr>
              <td>Slash commands</td>
              <td><kbd className="inkwell-kbd">/</kbd></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="inkwell-settings-section">
        <div className="inkwell-settings-section-title">Reset</div>
        <div className="inkwell-setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div>
            <div className="inkwell-setting-label">Reset all settings</div>
            <div className="inkwell-setting-desc">Restore all settings to their default values</div>
          </div>
          {!confirmReset ? (
            <button
              className="inkwell-btn-secondary"
              onClick={() => setConfirmReset(true)}
              style={{ marginTop: '0.5rem' }}
            >
              Reset to Defaults
            </button>
          ) : (
            <div className="inkwell-confirm-dialog">
              <span className="inkwell-confirm-text">Reset all settings?</span>
              <button
                className="inkwell-btn-danger"
                onClick={() => {
                  void (async () => {
                    if (isTauriEnvironment()) {
                      await saveClaudeApiKeyToSecureStorage('');
                    }
                    setClaudeApiKey('');
                    resetAll();
                    setConfirmReset(false);
                  })();
                }}
              >
                Yes, reset
              </button>
              <button className="inkwell-btn-secondary" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
