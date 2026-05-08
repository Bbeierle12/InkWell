'use client';

/**
 * SettingsModal — InkWell native settings.
 *
 * Left side nav (Appearance / Editor / AI & Privacy / Voice /
 * Shortcuts / About) with paper-themed swatches, font chips,
 * segmented controls, and toggles.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useSettingsStore,
} from '@/lib/settings-store';
import type {
  ThemeMode,
  EditorFontFamily,
  EditorFontSize,
  EditorWidth,
  AIProvider,
  GhostTextDelay,
  AutoSaveInterval,
} from '@/lib/settings-store';
import { useDocumentStore } from '@/lib/document-store';
import { editorJsonToMarkdown } from '@/lib/markdown-export';
import { destroyDocumentAI } from '@/lib/document-ai-instance';
import { saveClaudeApiKeyToSecureStorage } from '@/lib/claude-key-storage';
import { isTauriEnvironment } from '@/lib/tauri-bridge';
import { OllamaClient } from '@inkwell/document-ai';
import type { OllamaModelInfo } from '@inkwell/shared';

type SectionId =
  | 'appearance'
  | 'editor'
  | 'ai'
  | 'voice'
  | 'data'
  | 'shortcuts'
  | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SECTIONS: { id: SectionId; label: string; group: 'workspace' | 'system' }[] = [
  { id: 'appearance', label: 'Appearance', group: 'workspace' },
  { id: 'editor', label: 'Editor', group: 'workspace' },
  { id: 'ai', label: 'AI & Privacy', group: 'workspace' },
  { id: 'voice', label: 'Voice', group: 'workspace' },
  { id: 'data', label: 'Data', group: 'system' },
  { id: 'shortcuts', label: 'Shortcuts', group: 'system' },
  { id: 'about', label: 'About', group: 'system' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<SectionId>('appearance');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const workspaceSections = SECTIONS.filter((s) => s.group === 'workspace');
  const systemSections = SECTIONS.filter((s) => s.group === 'system');

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
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: 'var(--ink-3)' }}
          >
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2" />
          </svg>
          <span className="inkwell-modal-title">Settings</span>
          <span className="inkwell-modal-subtitle">InkWell · 1.0</span>
          <button
            className="inkwell-modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="inkwell-modal-body">
          <nav className="inkwell-modal-nav" role="tablist" aria-label="Settings sections">
            <div className="inkwell-modal-nav-section">Workspace</div>
            {workspaceSections.map((s) => (
              <button
                key={s.id}
                className={section === s.id ? 'on' : ''}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
            <div className="inkwell-modal-nav-section">System</div>
            {systemSections.map((s) => (
              <button
                key={s.id}
                className={section === s.id ? 'on' : ''}
                role="tab"
                aria-selected={section === s.id}
                onClick={() => setSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="inkwell-modal-main" role="tabpanel">
            {section === 'appearance' && <AppearanceSection />}
            {section === 'editor' && <EditorSection />}
            {section === 'ai' && <AISection />}
            {section === 'voice' && <VoiceSection />}
            {section === 'data' && <DataSection />}
            {section === 'shortcuts' && <ShortcutsSection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Appearance ───────────────────────────────────────────────────────────

function AppearanceSection() {
  const {
    theme,
    setTheme,
    editorFontFamily,
    setEditorFontFamily,
    editorFontSize,
    setEditorFontSize,
    editorWidth,
    setEditorWidth,
  } = useSettingsStore();

  const themes: { value: ThemeMode; label: string; swatch: 'paper' | 'dark' | 'classic' }[] = [
    { value: 'paper', label: 'Paper', swatch: 'paper' },
    { value: 'dark', label: 'Ink', swatch: 'dark' },
    { value: 'classic', label: 'Classic', swatch: 'classic' },
  ];

  const fonts: { value: EditorFontFamily; label: string; family: string }[] = [
    { value: 'serif', label: 'Serif', family: "'Source Serif 4', Georgia, serif" },
    { value: 'sans-serif', label: 'Sans', family: "'Inter', sans-serif" },
    { value: 'mono', label: 'Mono', family: "'JetBrains Mono', monospace" },
  ];

  return (
    <>
      <h4>Theme</h4>
      <div className="inkwell-theme-swatches">
        {themes.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`inkwell-theme-swatch ${t.swatch} ${theme === t.value ? 'on' : ''}`}
            onClick={() => setTheme(t.value)}
            aria-pressed={theme === t.value}
          >
            <div className="inkwell-theme-swatch-prv">
              <div className="bar" />
              <div className="ln" />
              <div className="ln" />
              <div className="ln" />
            </div>
            <div className="inkwell-theme-swatch-name">{t.label}</div>
          </button>
        ))}
      </div>

      <div className="inkwell-setting-row" style={{ marginTop: 10 }}>
        <div>
          <div className="inkwell-setting-label">Content width</div>
          <div className="inkwell-setting-desc">
            Width of the centered page on the canvas.
          </div>
        </div>
        <div className="inkwell-segmented">
          {(['narrow', 'default', 'wide', 'full'] as EditorWidth[]).map((w) => (
            <button
              key={w}
              type="button"
              className={`inkwell-segmented-option ${editorWidth === w ? 'on' : ''}`}
              onClick={() => setEditorWidth(w)}
            >
              {w[0].toUpperCase() + w.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <h4>Typography</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Body font</div>
          <div className="inkwell-setting-desc">
            The face used for document text and titles.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {fonts.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`inkwell-font-chip ${editorFontFamily === f.value ? 'on' : ''}`}
              onClick={() => setEditorFontFamily(f.value)}
              aria-pressed={editorFontFamily === f.value}
            >
              <div className="inkwell-font-chip-big" style={{ fontFamily: f.family }}>
                Aa
              </div>
              <div className="inkwell-font-chip-name">{f.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Base text size</div>
          <div className="inkwell-setting-desc">Editor body size. The ribbon stays fixed.</div>
        </div>
        <div className="inkwell-segmented">
          {(['small', 'default', 'large', 'xl'] as EditorFontSize[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`inkwell-segmented-option ${editorFontSize === s ? 'on' : ''}`}
              onClick={() => setEditorFontSize(s)}
            >
              {s === 'default' ? 'Med' : s === 'xl' ? 'XL' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────

function EditorSection() {
  const {
    autoSaveEnabled,
    setAutoSaveEnabled,
    autoSaveIntervalMs,
    setAutoSaveIntervalMs,
    spellCheck,
    setSpellCheck,
    showWordCount,
    setShowWordCount,
    showCharCount,
    setShowCharCount,
  } = useSettingsStore();

  return (
    <>
      <h4>Editor</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Spellcheck</div>
          <div className="inkwell-setting-desc">Browser-native, language-aware.</div>
        </div>
        <button
          type="button"
          className={`inkwell-toggle ${spellCheck ? 'on' : ''}`}
          onClick={() => setSpellCheck(!spellCheck)}
          role="switch"
          aria-checked={spellCheck}
          aria-label="Spellcheck"
        />
      </div>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Show word count</div>
        </div>
        <button
          type="button"
          className={`inkwell-toggle ${showWordCount ? 'on' : ''}`}
          onClick={() => setShowWordCount(!showWordCount)}
          role="switch"
          aria-checked={showWordCount}
        />
      </div>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Show character count</div>
        </div>
        <button
          type="button"
          className={`inkwell-toggle ${showCharCount ? 'on' : ''}`}
          onClick={() => setShowCharCount(!showCharCount)}
          role="switch"
          aria-checked={showCharCount}
        />
      </div>

      <h4>Autosave</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Autosave</div>
          <div className="inkwell-setting-desc">Debounced after typing stops.</div>
        </div>
        <button
          type="button"
          className={`inkwell-toggle ${autoSaveEnabled ? 'on' : ''}`}
          onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
          role="switch"
          aria-checked={autoSaveEnabled}
        />
      </div>
      {autoSaveEnabled && (
        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Interval</div>
          <div className="inkwell-segmented">
            {([10_000, 30_000, 60_000, 120_000, 300_000] as AutoSaveInterval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                className={`inkwell-segmented-option ${autoSaveIntervalMs === iv ? 'on' : ''}`}
                onClick={() => setAutoSaveIntervalMs(iv)}
              >
                {iv >= 60_000 ? `${iv / 60_000}m` : `${iv / 1000}s`}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── AI & Privacy ─────────────────────────────────────────────────────────

function AISection() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const setAiProvider = useSettingsStore((s) => s.setAiProvider);
  const claudeApiKey = useSettingsStore((s) =>
    typeof s.claudeApiKey === 'string' ? s.claudeApiKey : '',
  );
  const setClaudeApiKey = useSettingsStore((s) => s.setClaudeApiKey);
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl);
  const setOllamaBaseUrl = useSettingsStore((s) => s.setOllamaBaseUrl);
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);
  const setOllamaModel = useSettingsStore((s) => s.setOllamaModel);
  const ghostTextEnabled = useSettingsStore((s) => Boolean(s.ghostTextEnabled));
  const setGhostTextEnabled = useSettingsStore((s) => s.setGhostTextEnabled);
  const ghostTextDebounceMs = useSettingsStore((s) =>
    s.ghostTextDebounceMs === 300 ||
    s.ghostTextDebounceMs === 500 ||
    s.ghostTextDebounceMs === 800
      ? s.ghostTextDebounceMs
      : 500,
  );
  const setGhostTextDebounceMs = useSettingsStore((s) => s.setGhostTextDebounceMs);

  const [localKey, setLocalKey] = useState<string>(claudeApiKey);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyChanged = localKey !== claudeApiKey;

  const [localOllamaUrl, setLocalOllamaUrl] = useState(ollamaBaseUrl);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([]);
  const [ollamaHealth, setOllamaHealth] = useState<'connected' | 'disconnected' | 'checking'>(
    'checking',
  );
  const [ollamaLoadingModels, setOllamaLoadingModels] = useState(false);
  const ollamaUrlChanged = localOllamaUrl !== ollamaBaseUrl;

  useEffect(() => {
    setLocalKey(claudeApiKey);
  }, [claudeApiKey]);
  useEffect(() => {
    setLocalOllamaUrl(ollamaBaseUrl);
  }, [ollamaBaseUrl]);
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const checkOllamaAndLoadModels = useCallback(
    async (url: string) => {
      setOllamaHealth('checking');
      setOllamaLoadingModels(true);
      try {
        const healthy = await OllamaClient.checkHealth(url);
        if (healthy) {
          setOllamaHealth('connected');
          const models = await OllamaClient.listModels(url);
          setOllamaModels(models);
          if (!ollamaModel && models.length > 0) {
            setOllamaModel(models[0].name);
          }
        } else {
          setOllamaHealth('disconnected');
          setOllamaModels([]);
        }
      } catch {
        setOllamaHealth('disconnected');
        setOllamaModels([]);
      } finally {
        setOllamaLoadingModels(false);
      }
    },
    [ollamaModel, setOllamaModel],
  );

  useEffect(() => {
    if (aiProvider === 'ollama') {
      void checkOllamaAndLoadModels(ollamaBaseUrl);
    }
  }, [aiProvider, ollamaBaseUrl, checkOllamaAndLoadModels]);

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
      destroyDocumentAI();
      setSaved(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [localKey, setClaudeApiKey]);

  const handleSaveOllamaUrl = useCallback(() => {
    const trimmed = localOllamaUrl.trim();
    setOllamaBaseUrl(trimmed);
    destroyDocumentAI();
    void checkOllamaAndLoadModels(trimmed);
  }, [localOllamaUrl, setOllamaBaseUrl, checkOllamaAndLoadModels]);

  const handleProviderChange = useCallback(
    (provider: AIProvider) => {
      setAiProvider(provider);
      destroyDocumentAI();
    },
    [setAiProvider],
  );

  const handleOllamaModelChange = useCallback(
    (model: string) => {
      setOllamaModel(model);
      destroyDocumentAI();
    },
    [setOllamaModel],
  );

  const healthDot =
    ollamaHealth === 'connected'
      ? '#22c55e'
      : ollamaHealth === 'disconnected'
        ? '#ef4444'
        : '#9ca3af';

  return (
    <>
      <h4>AI Provider</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Provider</div>
          <div className="inkwell-setting-desc">
            Cloud (Claude) for top quality, or local (Ollama) for privacy and offline.
          </div>
        </div>
        <div className="inkwell-segmented">
          {(['claude', 'ollama'] as AIProvider[]).map((p) => (
            <button
              key={p}
              type="button"
              className={`inkwell-segmented-option ${aiProvider === p ? 'on' : ''}`}
              onClick={() => handleProviderChange(p)}
            >
              {p === 'claude' ? 'Claude' : 'Ollama'}
            </button>
          ))}
        </div>
      </div>

      {aiProvider === 'claude' && (
        <>
          <div style={{ marginTop: 12 }}>
            <div className="inkwell-setting-label" style={{ marginBottom: 6 }}>
              Claude API key
            </div>
            <div className="inkwell-setting-desc" style={{ marginBottom: 8 }}>
              Stored in your system keychain when running in the desktop app.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
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
                style={{ whiteSpace: 'nowrap' }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
              <button
                className="inkwell-btn-primary"
                onClick={() => void handleSaveKey()}
                disabled={!keyChanged || saving}
                style={{ whiteSpace: 'nowrap' }}
              >
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </button>
            </div>
            {saveError && (
              <div
                className="inkwell-setting-desc"
                style={{ color: 'var(--diff-del)', marginTop: 8 }}
              >
                {saveError}
              </div>
            )}
          </div>
        </>
      )}

      {aiProvider === 'ollama' && (
        <>
          <div className="inkwell-setting-row">
            <div>
              <div className="inkwell-setting-label">Connection</div>
              <div className="inkwell-setting-desc">
                {ollamaHealth === 'checking'
                  ? 'Checking…'
                  : ollamaHealth === 'connected'
                    ? 'Connected'
                    : 'Disconnected'}
              </div>
            </div>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: healthDot,
              }}
              aria-label={`Ollama ${ollamaHealth}`}
            />
          </div>
          <div style={{ marginTop: 6 }}>
            <div className="inkwell-setting-label" style={{ marginBottom: 6 }}>
              Server URL
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="inkwell-setting-input"
                value={localOllamaUrl}
                onChange={(e) => setLocalOllamaUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <button
                className="inkwell-btn-primary"
                onClick={handleSaveOllamaUrl}
                disabled={!ollamaUrlChanged}
              >
                Save
              </button>
            </div>
          </div>
          <div className="inkwell-setting-row">
            <div>
              <div className="inkwell-setting-label">Model</div>
              <div className="inkwell-setting-desc">
                {ollamaModels.length === 0 && ollamaHealth === 'connected'
                  ? 'No models. Try: ollama pull llama3.2'
                  : ollamaModels.length === 0
                    ? 'Connect to see models'
                    : `${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''} available`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                className="inkwell-setting-select"
                value={ollamaModel}
                onChange={(e) => handleOllamaModelChange(e.target.value)}
                disabled={ollamaModels.length === 0}
              >
                {ollamaModels.length === 0 && <option value="">No models</option>}
                {ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                className="inkwell-btn-secondary"
                onClick={() => void checkOllamaAndLoadModels(ollamaBaseUrl)}
                disabled={ollamaLoadingModels}
              >
                {ollamaLoadingModels ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
        </>
      )}

      <h4>Inline suggestions</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Ghost text</div>
          <div className="inkwell-setting-desc">
            Local model · ~180ms · pressed Tab to accept.
          </div>
        </div>
        <button
          type="button"
          className={`inkwell-toggle ${ghostTextEnabled ? 'on' : ''}`}
          onClick={() => setGhostTextEnabled(!ghostTextEnabled)}
          role="switch"
          aria-checked={ghostTextEnabled}
        />
      </div>
      {ghostTextEnabled && (
        <div className="inkwell-setting-row">
          <div className="inkwell-setting-label">Suggestion delay</div>
          <div className="inkwell-segmented">
            {([300, 500, 800] as GhostTextDelay[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`inkwell-segmented-option ${ghostTextDebounceMs === d ? 'on' : ''}`}
                onClick={() => setGhostTextDebounceMs(d)}
              >
                {d === 300 ? 'Fast' : d === 500 ? 'Default' : 'Slow'}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Voice ────────────────────────────────────────────────────────────────

function VoiceSection() {
  return (
    <>
      <h4>Voice</h4>
      <div className="inkwell-setting-row">
        <div className="inkwell-setting-label">Microphone</div>
        <span className="inkwell-kbd">System default</span>
      </div>
      <div className="inkwell-setting-row">
        <div className="inkwell-setting-label">Language</div>
        <div className="inkwell-segmented">
          <button type="button" className="inkwell-segmented-option on">
            English (US)
          </button>
          <button type="button" className="inkwell-segmented-option">
            Auto-detect
          </button>
        </div>
      </div>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Clean up with Claude</div>
          <div className="inkwell-setting-desc">
            Refine raw Whisper transcripts before inserting.
          </div>
        </div>
        <button type="button" className="inkwell-toggle on" role="switch" aria-checked />
      </div>
    </>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────

function DataSection() {
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
    const store = useDocumentStore.getState();
    for (const doc of documents) {
      await store.permanentDelete(doc.id);
    }
    setConfirmClear(false);
  }, [documents]);

  return (
    <>
      <h4>Export</h4>
      <div className="inkwell-setting-row">
        <div>
          <div className="inkwell-setting-label">Export all documents</div>
          <div className="inkwell-setting-desc">
            Download all {activeDocuments.length} document
            {activeDocuments.length !== 1 ? 's' : ''} as Markdown.
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

      <h4>Danger zone</h4>
      <div
        className="inkwell-setting-row"
        style={{ flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <div>
          <div className="inkwell-setting-label">Delete all documents</div>
          <div className="inkwell-setting-desc">
            Permanently delete all documents including trash.
          </div>
        </div>
        {!confirmClear ? (
          <button
            className="inkwell-btn-danger"
            onClick={() => setConfirmClear(true)}
            disabled={documents.length === 0}
            style={{ marginTop: 8 }}
          >
            Delete All
          </button>
        ) : (
          <div className="inkwell-confirm-dialog">
            <span className="inkwell-confirm-text">Are you sure?</span>
            <button className="inkwell-btn-danger" onClick={handleClearAll}>
              Yes, delete
            </button>
            <button
              className="inkwell-btn-secondary"
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Shortcuts ────────────────────────────────────────────────────────────

function ShortcutsSection() {
  const rows: [string, ...string[]][] = [
    ['Toggle sidebar', 'Ctrl', '\\'],
    ['Open AI chat', 'Ctrl', 'Shift', 'L'],
    ['Slash commands', '/'],
    ['Bold', 'Ctrl', 'B'],
    ['Italic', 'Ctrl', 'I'],
    ['Underline', 'Ctrl', 'U'],
    ['Accept ghost text', 'Tab'],
  ];

  return (
    <>
      <h4>Keyboard</h4>
      {rows.map(([label, ...keys], i) => (
        <div className="inkwell-setting-row" key={i}>
          <div className="inkwell-setting-label">{label}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {keys.map((k, j) => (
              <span key={j} className="inkwell-kbd">
                {k}
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ── About ────────────────────────────────────────────────────────────────

function AboutSection() {
  const { resetAll, setClaudeApiKey } = useSettingsStore();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <h4>About InkWell</h4>
      <p
        style={{
          fontFamily: "'Source Serif 4', serif",
          fontSize: 15,
          lineHeight: 1.55,
          color: 'var(--ink-2)',
          margin: '0 0 14px',
          maxWidth: 460,
        }}
      >
        An AI-native word processor that keeps your attention on the sentence. Local
        inference when you want it, cloud when you need it.
      </p>
      <div className="inkwell-setting-row">
        <div className="inkwell-setting-label">Version</div>
        <span className="inkwell-kbd">0.0.1</span>
      </div>
      <div className="inkwell-setting-row">
        <div className="inkwell-setting-label">Built with</div>
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Next.js · TipTap · Claude</span>
      </div>

      <h4>Reset</h4>
      <div
        className="inkwell-setting-row"
        style={{ flexDirection: 'column', alignItems: 'flex-start' }}
      >
        <div>
          <div className="inkwell-setting-label">Reset all settings</div>
          <div className="inkwell-setting-desc">Restore defaults.</div>
        </div>
        {!confirmReset ? (
          <button
            className="inkwell-btn-secondary"
            onClick={() => setConfirmReset(true)}
            style={{ marginTop: 8 }}
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
            <button
              className="inkwell-btn-secondary"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}
