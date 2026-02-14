/**
 * Origin Filter Tests
 *
 * Verifies that the origin filter correctly distinguishes local from remote
 * Y.js changes, ensuring remote edits do not trigger AI suggestion generation.
 *
 * Ref: Invariant: remote-changes-no-suggestion-trigger
 */
import { originFilter } from '../origin-filter';

describe('Origin Filter', () => {
  it('should return true for null origin (local change, no provider)', () => {
    expect(originFilter(null)).toBe(true);
  });

  it('should return true for undefined origin (local change)', () => {
    expect(originFilter(undefined)).toBe(true);
  });

  it('should return false for "remote" string origin', () => {
    expect(originFilter('remote')).toBe(false);
  });

  it('should return false for object with isLocal: false', () => {
    expect(originFilter({ isLocal: false })).toBe(false);
  });

  it('should return true for object with isLocal: true', () => {
    expect(originFilter({ isLocal: true })).toBe(true);
  });

  it('should return true for unknown origin types (safe default)', () => {
    // Numbers, arbitrary strings, and other objects should default to local
    expect(originFilter(42)).toBe(true);
    expect(originFilter('local')).toBe(true);
    expect(originFilter('some-provider')).toBe(true);
    expect(originFilter({ someOtherProp: 'value' })).toBe(true);
    expect(originFilter(true)).toBe(true);
  });
});
