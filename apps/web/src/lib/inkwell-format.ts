/**
 * .inkwell File Format — JSON-based document format for Inkwell.
 *
 * The .inkwell format wraps TipTap editor JSON with metadata
 * (title, tags, timestamps, word count) and a version field
 * for future schema evolution.
 */

export interface InkwellFileMetadata {
  title: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  wordCount: number;
}

export interface InkwellFileSchema {
  version: 1;
  metadata: InkwellFileMetadata;
  content: Record<string, unknown>;
}

export interface SerializeOptions {
  tags?: string[];
  createdAt?: string;
  wordCount?: number;
}

/**
 * Serialize editor content into a .inkwell JSON string.
 */
export function serializeInkwellFile(
  title: string,
  content: Record<string, unknown>,
  opts?: SerializeOptions,
): string {
  const now = new Date().toISOString();
  const schema: InkwellFileSchema = {
    version: 1,
    metadata: {
      title,
      tags: opts?.tags ?? [],
      createdAt: opts?.createdAt ?? now,
      updatedAt: now,
      wordCount: opts?.wordCount ?? 0,
    },
    content,
  };
  return JSON.stringify(schema, null, 2);
}

/**
 * Deserialize a .inkwell JSON string into a validated schema object.
 *
 * Throws on invalid JSON, missing required fields, or unsupported version.
 */
export function deserializeInkwellFile(raw: string): InkwellFileSchema {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid .inkwell file: malformed JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid .inkwell file: root must be an object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.version !== 'number') {
    throw new Error('Invalid .inkwell file: missing or invalid version field');
  }

  if (obj.version !== 1) {
    throw new Error(
      `Unsupported .inkwell version: ${obj.version}. This app supports version 1.`,
    );
  }

  if (typeof obj.metadata !== 'object' || obj.metadata === null) {
    throw new Error('Invalid .inkwell file: missing metadata');
  }

  const meta = obj.metadata as Record<string, unknown>;

  if (typeof meta.title !== 'string') {
    throw new Error('Invalid .inkwell file: metadata.title must be a string');
  }

  if (typeof obj.content !== 'object' || obj.content === null || Array.isArray(obj.content)) {
    throw new Error('Invalid .inkwell file: missing or invalid content');
  }

  return {
    version: 1,
    metadata: {
      title: meta.title,
      tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === 'string') : [],
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : '',
      updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : '',
      wordCount: typeof meta.wordCount === 'number' ? meta.wordCount : 0,
    },
    content: obj.content as Record<string, unknown>,
  };
}
