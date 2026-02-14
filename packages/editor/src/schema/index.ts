/**
 * ProseMirror schema definition for Inkwell documents.
 */
import { Schema } from '@tiptap/pm/model';
import { nodes } from './nodes';
import { marks } from './marks';

/** The canonical Inkwell document schema. */
export const inkwellSchema = new Schema({ nodes, marks });

export { nodes, marks };
