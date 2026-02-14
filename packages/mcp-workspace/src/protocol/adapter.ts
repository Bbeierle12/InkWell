/**
 * MCP Protocol Adapter
 *
 * Isolates MCP version-specific header and protocol changes.
 */

/**
 * Adapt requests/responses for the current MCP protocol version.
 */
export class MCPAdapter {
  /**
   * Get the protocol version string.
   */
  getVersion(): string {
    return '2024-11-05';
  }

  /**
   * Validate a request against the protocol spec.
   *
   * Returns true if the request is a non-null object with
   * `jsonrpc === '2.0'` and `method` is a non-empty string.
   */
  validateRequest(request: unknown): boolean {
    if (request === null || typeof request !== 'object') {
      return false;
    }
    const req = request as Record<string, unknown>;
    if (req.jsonrpc !== '2.0') {
      return false;
    }
    if (typeof req.method !== 'string' || req.method.length === 0) {
      return false;
    }
    return true;
  }
}
