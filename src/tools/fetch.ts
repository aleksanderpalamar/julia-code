import type { ToolDefinition } from './types.js';

export const fetchTool: ToolDefinition = {
  name: 'fetch',
  description: 'Fetch a URL and return its content. Supports HTML pages (returns text), JSON APIs, and plain text. Useful for accessing the internet, reading documentation, or calling APIs.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      method: {
        type: 'string',
        description: 'HTTP method (default: GET)',
      },
      headers: {
        type: 'object',
        description: 'Optional HTTP headers as key-value pairs',
      },
      body: {
        type: 'string',
        description: 'Optional request body (for POST/PUT)',
      },
      max_length: {
        type: 'number',
        description: 'Max response length in characters (default: 20000)',
      },
    },
    required: ['url'],
  },

  async execute(args) {
    const url = args.url as string;
    const method = (args.method as string) ?? 'GET';
    const headers = (args.headers as Record<string, string>) ?? {};
    const body = args.body as string | undefined;
    const maxLength = (args.max_length as number) ?? 20000;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': 'JuliaCode/0.1',
          ...headers,
        },
        body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') ?? '';
      let text = await res.text();

      // Strip HTML tags for cleaner output if it's an HTML page
      if (contentType.includes('text/html')) {
        text = htmlToText(text);
      }

      // Truncate if too long
      if (text.length > maxLength) {
        text = text.slice(0, maxLength) + '\n\n[... truncated]';
      }

      const statusInfo = `HTTP ${res.status} ${res.statusText}`;

      return {
        success: res.ok,
        output: `${statusInfo}\n\n${text.trim()}`,
        error: res.ok ? undefined : statusInfo,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: '',
        error: message.includes('abort') ? 'Request timed out (30s)' : message,
      };
    }
  },
};

/**
 * Basic HTML to text conversion — strips tags, decodes common entities,
 * removes scripts/styles, and collapses whitespace.
 */
function htmlToText(html: string): string {
  return html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    // Block-level elements → newlines
    .replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Collapse whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
