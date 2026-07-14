'use client';

/**
 * Toolbar — Word-style title bar + ribbon for InkWell.
 *
 * Renders a macOS-style title bar above a tabbed ribbon
 * (Home / Insert / Write / AI / Review / View / Voice).
 * Each tab surfaces relevant controls; formatting and AI
 * actions wire into the TipTap editor and document AI pipeline.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { OperationType } from '@inkwell/shared';
import { VoiceInput } from './VoiceInput';
import { DocumentTitle } from './DocumentTitle';
import { ExportMenu } from './ExportMenu';
import { useDocumentStore } from '@/lib/document-store';
import { useChatStore } from '@/lib/chat-store';
import { useSettingsStore } from '@/lib/settings-store';
import type { UseVoicePipelineReturn } from '../hooks/useVoicePipeline';

interface ToolbarProps {
  editor: Editor | null;
  onAIOperation: (operation: OperationType, args?: string) => void;
  voicePipeline: UseVoicePipelineReturn;
  isLocalMode: boolean;
  onOpenSettings?: () => void;
  onToggleChat?: () => void;
}

const TABS = ['Home', 'Insert', 'Write', 'AI', 'Review', 'View', 'Voice'] as const;
type TabName = (typeof TABS)[number];

// ── Icons ────────────────────────────────────────────────────────────────

const Icon = {
  bold: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h6a3 3 0 0 1 0 6H5zm0 6h7a3 3 0 0 1 0 6H5z" />
    </svg>
  ),
  italic: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 4h8M4 16h8M12 4l-4 12" />
    </svg>
  ),
  under: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4v7a4 4 0 0 0 8 0V4M4 17h12" />
    </svg>
  ),
  strike: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h14M7 6c0-1.5 1.5-2 3-2s4 .5 4 3M13 14c0 2-2 2.5-4 2.5s-3.5-.5-3.5-2.5" />
    </svg>
  ),
  code: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6l-4 4 4 4M12 6l4 4-4 4" />
    </svg>
  ),
  ul: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="6" r="1.2" fill="currentColor" />
      <circle cx="4" cy="10" r="1.2" fill="currentColor" />
      <circle cx="4" cy="14" r="1.2" fill="currentColor" />
      <path d="M8 6h10M8 10h10M8 14h10" />
    </svg>
  ),
  ol: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h2v3M3 8h3M8 6h10M8 10h10M8 14h10M3 12h2.5L3 15h3" />
    </svg>
  ),
  align: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14M3 9h10M3 13h14M3 17h10" />
    </svg>
  ),
  alignC: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14M6 9h8M3 13h14M6 17h8" />
    </svg>
  ),
  alignR: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5h14M7 9h10M3 13h14M7 17h10" />
    </svg>
  ),
  quote: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7c-1 1-2 3-2 5h3v3H3v-3M13 7c-1 1-2 3-2 5h3v3h-3v-3" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <circle cx="7" cy="8" r="1.3" />
      <path d="M3 14l4-4 4 4 3-3 3 3" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="14" height="12" rx="1" />
      <path d="M3 8h14M3 12h14M8 4v12M13 4v12" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 12a3 3 0 0 1 4-4l1-1a3 3 0 0 1 4 4l-3 3M12 8a3 3 0 0 1-4 4l-1 1a3 3 0 0 1-4-4l3-3" />
    </svg>
  ),
  mic: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="4" height="9" rx="2" />
      <path d="M5 10a5 5 0 0 0 10 0M10 15v3M7 18h6" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z" />
      <path d="M16 13l.7 1.8L18.5 15l-1.8.7L16 17.5l-.7-1.8L13.5 15l1.8-.7z" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 4V5z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l4 4" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6M10 3v10M6 7l4-4 4 4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2" />
    </svg>
  ),
  paper: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3h7l4 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v4h4" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5a3 3 0 0 1 3 3v9a2 2 0 0 0-2-2H4zM16 4h-5a3 3 0 0 0-3 3v9a2 2 0 0 1 2-2h6z" />
    </svg>
  ),
  folder: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  recDot: (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <circle cx="10" cy="10" r="6" />
    </svg>
  ),
};

// ── Title bar ────────────────────────────────────────────────────────────

function TitleBar({ isLocalMode }: { isLocalMode: boolean }) {
  const { title } = useDocumentStore();
  return (
    <div className="inkwell-titlebar" role="presentation">
      <div className="inkwell-titlebar-lights" aria-hidden="true">
        <span className="inkwell-titlebar-light r" />
        <span className="inkwell-titlebar-light y" />
        <span className="inkwell-titlebar-light g" />
      </div>
      <div className="inkwell-titlebar-center">
        <span className="dot" />
        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{title || 'Untitled'}</span>
        <span style={{ color: 'var(--ink-4)' }}>— InkWell</span>
      </div>
      <div className="inkwell-titlebar-right">
        <span className={`inkwell-titlebar-chip ${isLocalMode ? 'offline' : ''}`}>
          <span className="led" />
          {isLocalMode ? 'Offline' : 'Online · Sonnet'}
        </span>
      </div>
    </div>
  );
}

// ── Ribbon group helpers ─────────────────────────────────────────────────

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inkwell-ribbon-group">
      <div className="inkwell-ribbon-group-body">{children}</div>
      <div className="inkwell-ribbon-group-label">{label}</div>
    </div>
  );
}

function RibbonButton({
  label,
  icon,
  onClick,
  active,
  disabled,
  big,
  ariaLabel,
  title,
  className,
}: {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  big?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`inkwell-rbtn ${big ? 'big' : ''} ${active ? 'active' : ''} ${className ?? ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel ?? label}
      title={title}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function SmallButton({
  label,
  icon,
  onClick,
  active,
  disabled,
  ariaLabel,
  title,
}: {
  label?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`inkwell-rbtn small ${active ? 'active' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel ?? label}
      title={title}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Tab content ──────────────────────────────────────────────────────────

function HomeRibbon({ editor }: { editor: Editor | null }) {
  const setHeading = (level: 1 | 2 | 3 | 0) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
  };

  return (
    <>
      <Group label="Font">
        <div className="inkwell-rcluster" style={{ gap: 4 }}>
          <div className="inkwell-rrow">
            <SmallButton
              icon={Icon.bold}
              ariaLabel="Bold"
              title="Bold (Ctrl+B)"
              active={editor?.isActive('bold') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            />
            <SmallButton
              icon={Icon.italic}
              ariaLabel="Italic"
              title="Italic (Ctrl+I)"
              active={editor?.isActive('italic') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            />
            <SmallButton
              icon={Icon.under}
              ariaLabel="Underline"
              title="Underline (Ctrl+U)"
              active={editor?.isActive('underline') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            />
            <SmallButton
              icon={Icon.strike}
              ariaLabel="Strikethrough"
              title="Strikethrough"
              active={editor?.isActive('strike') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            />
            <SmallButton
              icon={Icon.code}
              ariaLabel="Code"
              title="Inline code"
              active={editor?.isActive('code') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleCode().run()}
            />
          </div>
        </div>
      </Group>

      <Group label="Paragraph">
        <div className="inkwell-rcluster" style={{ gap: 4 }}>
          <div className="inkwell-rrow">
            <SmallButton
              icon={Icon.ul}
              ariaLabel="Bullet list"
              title="Bullet list"
              active={editor?.isActive('bulletList') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            />
            <SmallButton
              icon={Icon.ol}
              ariaLabel="Ordered list"
              title="Ordered list"
              active={editor?.isActive('orderedList') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            />
            <SmallButton
              icon={Icon.quote}
              ariaLabel="Blockquote"
              title="Blockquote"
              active={editor?.isActive('blockquote') ?? false}
              disabled={!editor}
              onClick={() => editor?.chain().focus().toggleBlockquote().run()}
            />
          </div>
          <div className="inkwell-rrow">
            <SmallButton icon={Icon.align} ariaLabel="Align left" active />
            <SmallButton icon={Icon.alignC} ariaLabel="Align center" />
            <SmallButton icon={Icon.alignR} ariaLabel="Align right" />
          </div>
        </div>
      </Group>

      <Group label="Styles">
        <RibbonButton
          big
          label="Body"
          ariaLabel="Body style"
          icon={
            <span style={{ fontFamily: "'Source Serif 4',serif", fontWeight: 600, fontSize: 15 }}>
              Aa
            </span>
          }
          active={editor?.isActive('paragraph') && !editor?.isActive('heading')}
          disabled={!editor}
          onClick={() => setHeading(0)}
        />
        <RibbonButton
          big
          label="Title"
          ariaLabel="Heading 1"
          icon={
            <span style={{ fontFamily: "'Source Serif 4',serif", fontWeight: 600, fontSize: 17 }}>
              H1
            </span>
          }
          active={editor?.isActive('heading', { level: 1 }) ?? false}
          disabled={!editor}
          onClick={() => setHeading(1)}
        />
        <RibbonButton
          big
          label="Section"
          ariaLabel="Heading 2"
          icon={
            <span style={{ fontFamily: "'Source Serif 4',serif", fontWeight: 600, fontSize: 14 }}>
              H2
            </span>
          }
          active={editor?.isActive('heading', { level: 2 }) ?? false}
          disabled={!editor}
          onClick={() => setHeading(2)}
        />
        <RibbonButton
          big
          label="Sub"
          ariaLabel="Heading 3"
          icon={
            <span style={{ fontFamily: "'Source Serif 4',serif", fontWeight: 600, fontSize: 13 }}>
              H3
            </span>
          }
          active={editor?.isActive('heading', { level: 3 }) ?? false}
          disabled={!editor}
          onClick={() => setHeading(3)}
        />
      </Group>

      <Group label="Editing">
        <div className="inkwell-rcluster" style={{ gap: 4 }}>
          <SmallButton
            icon={Icon.search}
            label="Find"
            ariaLabel="Find"
            disabled={!editor}
          />
          <SmallButton
            icon={Icon.eye}
            label="Focus"
            ariaLabel="Focus mode"
            onClick={() => editor?.chain().focus().run()}
          />
        </div>
      </Group>
    </>
  );
}

function InsertRibbon({ editor }: { editor: Editor | null }) {
  return (
    <>
      <Group label="Media">
        <RibbonButton
          big
          label="Image"
          icon={Icon.image}
          disabled={!editor}
          onClick={() => {
            const url = window.prompt('Image URL');
            if (url) editor?.chain().focus().run();
          }}
        />
        <RibbonButton big label="Table" icon={Icon.table} disabled />
        <RibbonButton label="Link" icon={Icon.link} disabled={!editor} />
      </Group>
      <Group label="Structure">
        <RibbonButton
          label="Quote"
          icon={Icon.quote}
          disabled={!editor}
          active={editor?.isActive('blockquote') ?? false}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <RibbonButton
          label="Code"
          icon={Icon.code}
          disabled={!editor}
          active={editor?.isActive('codeBlock') ?? false}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />
        <RibbonButton
          label="Divider"
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h14M3 10l3-3M3 10l3 3" />
            </svg>
          }
          disabled={!editor}
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        />
      </Group>
      <Group label="AI-generated">
        <RibbonButton
          big
          label="Draft"
          icon={Icon.spark}
          className="ai"
          ariaLabel="AI draft"
          disabled={!editor}
        />
        <RibbonButton big label="Outline" icon={Icon.spark} className="ai" disabled={!editor} />
        <RibbonButton label="Citation" icon={Icon.spark} className="ai" disabled />
      </Group>
    </>
  );
}

function WriteRibbon() {
  return (
    <>
      <Group label="Focus">
        <RibbonButton big label="Focus mode" icon={Icon.eye} />
        <RibbonButton
          label="Typewriter"
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="5" width="12" height="10" rx="1" />
              <path d="M4 9h12" />
            </svg>
          }
        />
      </Group>
      <Group label="Goals">
        <div className="inkwell-rcluster" style={{ gap: 4, minWidth: 180 }}>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Daily target — 1,000 words</div>
          <div style={{ height: 6, background: 'var(--rule)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: '68%',
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent), var(--gold))',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>684 / 1,000 · 32 min today</div>
        </div>
      </Group>
      <Group label="Style Guide">
        <RibbonButton big label="My Voice" icon={Icon.book} />
        <RibbonButton
          label="Chicago"
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h12M4 9h12M4 13h8" />
            </svg>
          }
        />
      </Group>
    </>
  );
}

function AIRibbon({
  editor,
  onAIOperation,
}: {
  editor: Editor | null;
  onAIOperation: (op: OperationType, args?: string) => void;
}) {
  const ghostTextEnabled = useSettingsStore((s) => Boolean(s.ghostTextEnabled));
  const setGhostTextEnabled = useSettingsStore((s) => s.setGhostTextEnabled);

  return (
    <>
      <Group label="Rewrite & Tones">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <RibbonButton
            big
            label="Rewrite"
            icon={Icon.spark}
            className="ai"
            disabled={!editor}
            onClick={() => onAIOperation(OperationType.Rewrite)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
            <button
              type="button"
              className="inkwell-rbtn small ai"
              disabled={!editor}
              onClick={() => onAIOperation(OperationType.Rewrite, 'Sweet and Friendly')}
              style={{ height: 20, padding: '2px 6px', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>🌸</span> Sweet & Friendly
            </button>
            <button
              type="button"
              className="inkwell-rbtn small ai"
              disabled={!editor}
              onClick={() => onAIOperation(OperationType.Rewrite, 'Professional and Clear')}
              style={{ height: 20, padding: '2px 6px', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>💼</span> Professional
            </button>
            <button
              type="button"
              className="inkwell-rbtn small ai"
              disabled={!editor}
              onClick={() => onAIOperation(OperationType.Rewrite, 'Short and Direct')}
              style={{ height: 20, padding: '2px 6px', fontSize: 10, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span>⚡</span> Short & Direct
            </button>
          </div>
        </div>
      </Group>
      <Group label="Shape">
        <RibbonButton
          big
          label="Summarize"
          icon={Icon.spark}
          disabled={!editor}
          onClick={() => onAIOperation(OperationType.Summarize)}
        />
        <RibbonButton
          big
          label="Expand"
          icon={Icon.spark}
          disabled={!editor}
          onClick={() => onAIOperation(OperationType.Expand)}
        />
        <RibbonButton
          big
          label="Critique"
          icon={Icon.spark}
          disabled={!editor}
          onClick={() => onAIOperation(OperationType.Critique)}
        />
      </Group>
      <Group label="Ghost Text">
        <div className="inkwell-rcluster" style={{ gap: 4, minWidth: 170 }}>
          <button
            type="button"
            onClick={() => setGhostTextEnabled(!ghostTextEnabled)}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              fontSize: 11.5,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--ink-2)',
              padding: 0,
            }}
            aria-pressed={ghostTextEnabled}
          >
            <span
              style={{
                display: 'inline-block',
                width: 28,
                height: 16,
                borderRadius: 9999,
                background: ghostTextEnabled ? 'var(--accent)' : 'var(--rule-2)',
                position: 'relative',
                transition: 'background 0.15s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  right: ghostTextEnabled ? 2 : 14,
                  left: ghostTextEnabled ? 'auto' : 2,
                  top: 2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'all 0.15s',
                }}
              />
            </span>
            Inline suggestions
          </button>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>Local · Llama 3.2 · ~180ms</div>
        </div>
      </Group>
    </>
  );
}

function ReviewRibbon({
  editor,
  onAIOperation,
}: {
  editor: Editor | null;
  onAIOperation: (op: OperationType, args?: string) => void;
}) {
  return (
    <>
      <Group label="Proofing">
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <RibbonButton
            big
            label="AI Proofread"
            icon={Icon.spark}
            className="ai"
            disabled={!editor}
            onClick={() => onAIOperation(OperationType.Proofread)}
          />
          <div className="inkwell-rcluster" style={{ gap: 4 }}>
            <SmallButton
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15l3-7h6l3 7M6 12h8" />
                  <path d="M4 17h12" />
                </svg>
              }
              label="Spell"
              ariaLabel="Spell"
              disabled={!editor}
              onClick={() => onAIOperation(OperationType.Proofread)}
            />
            <SmallButton
              icon={
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h12M4 6h8M4 14h10" />
                </svg>
              }
              label="Grammar"
              ariaLabel="Grammar"
              disabled={!editor}
              onClick={() => onAIOperation(OperationType.Proofread)}
            />
          </div>
        </div>
      </Group>
      <Group label="Comments">
        <RibbonButton big label="New" icon={Icon.chat} />
        <RibbonButton label="Prev" />
        <RibbonButton label="Next" />
      </Group>
    </>
  );
}

function ViewRibbon({ onToggleChat }: { onToggleChat?: () => void }) {
  const { sidebarOpen, toggleSidebar } = useDocumentStore();
  const chatOpen = useChatStore((s) => s.chatOpen);
  return (
    <>
      <Group label="Layout">
        <RibbonButton big label="Print" icon={Icon.paper} active />
        <RibbonButton
          label="Web"
          icon={
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="14" height="12" />
            </svg>
          }
        />
        <RibbonButton label="Focus" icon={Icon.eye} />
      </Group>
      <Group label="Show">
        <SmallButton
          label="Sidebar"
          active={sidebarOpen}
          onClick={toggleSidebar}
          title="Toggle sidebar (Ctrl+\\)"
        />
        <SmallButton
          label="AI rail"
          active={chatOpen}
          onClick={onToggleChat}
          title="Toggle AI chat (Ctrl+Shift+L)"
        />
      </Group>
      <Group label="Zoom">
        <RibbonButton label="100%" />
        <RibbonButton label="Width" />
        <RibbonButton label="Page" />
      </Group>
    </>
  );
}

function VoiceRibbon({ voicePipeline }: { voicePipeline: UseVoicePipelineReturn }) {
  return (
    <>
      <Group label="Record">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <VoiceInput pipeline={voicePipeline} />
        </div>
        <RibbonButton label="Dictate" icon={Icon.mic} />
      </Group>
      <Group label="Refine">
        <RibbonButton big label="Clean up" icon={Icon.spark} />
        <RibbonButton label="Punctuation" />
      </Group>
      <Group label="Model">
        <div className="inkwell-rcluster" style={{ gap: 3, fontSize: 11, color: 'var(--ink-3)', minWidth: 160 }}>
          <div>Whisper · local</div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>16kHz · mono · offline OK</div>
        </div>
      </Group>
    </>
  );
}

// ── Main toolbar ────────────────────────────────────────────────────────

export function Toolbar({
  editor,
  onAIOperation,
  voicePipeline,
  isLocalMode,
  onOpenSettings,
  onToggleChat,
}: ToolbarProps) {
  const [tab, setTab] = useState<TabName>('Home');
  const [, setTick] = useState(0);

  // Force re-render on transactions so active states update.
  useEffect(() => {
    if (!editor) return;
    const handler = () => setTick((t) => t + 1);
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  return (
    <div className="inkwell-ribbon-shell" role="toolbar" aria-label="Editor toolbar">
      <TitleBar isLocalMode={isLocalMode} />

      <div className="inkwell-ribbon">
        <div className="inkwell-ribbon-tabs">
          <div className="inkwell-ribbon-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path
                d="M6 20c2-6 6-10 12-14M6 20l2-6M6 20h7"
                style={{ color: 'var(--accent)' }}
              />
              <circle cx="17" cy="7" r="2.5" fill="var(--gold)" stroke="none" />
            </svg>
            <span>InkWell</span>
          </div>

          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`inkwell-ribbon-tab ${tab === t ? 'active' : ''} ${t === 'AI' ? 'ai' : ''}`.trim()}
              onClick={() => setTab(t)}
            >
              {t === 'AI' && <span className="spark" />}
              {t}
            </button>
          ))}

          <div className="inkwell-ribbon-actions">
            <DocumentTitleAction />
            <ExportMenu editor={editor} />
            <button
              type="button"
              className="inkwell-ribbon-action"
              aria-label="Share"
              title="Share"
            >
              {Icon.share}
              Share
            </button>
            {onToggleChat && (
              <button
                type="button"
                className="inkwell-ribbon-action"
                onClick={onToggleChat}
                aria-label="Ask InkWell (Ctrl+Shift+L)"
                title="Ask InkWell (Ctrl+Shift+L)"
              >
                {Icon.chat}
                Ask InkWell
              </button>
            )}
            {onOpenSettings && (
              <button
                type="button"
                className="inkwell-ribbon-action"
                onClick={onOpenSettings}
                aria-label="Settings"
                title="Settings"
              >
                {Icon.settings}
              </button>
            )}
          </div>
        </div>

        <div className="inkwell-ribbon-body">
          {tab === 'Home' && <HomeRibbon editor={editor} />}
          {tab === 'Insert' && <InsertRibbon editor={editor} />}
          {tab === 'Write' && <WriteRibbon />}
          {tab === 'AI' && <AIRibbon editor={editor} onAIOperation={onAIOperation} />}
          {tab === 'Review' && <ReviewRibbon editor={editor} onAIOperation={onAIOperation} />}
          {tab === 'View' && <ViewRibbon onToggleChat={onToggleChat} />}
          {tab === 'Voice' && <VoiceRibbon voicePipeline={voicePipeline} />}
        </div>
      </div>
    </div>
  );
}

function DocumentTitleAction() {
  return (
    <div style={{ marginRight: 4, display: 'flex', alignItems: 'center' }}>
      <DocumentTitle />
    </div>
  );
}
