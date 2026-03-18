import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ClipboardTool = 'wl-paste' | 'xclip' | 'pbpaste';

let cachedTool: ClipboardTool | null | undefined;

async function which(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function detectTool(): Promise<ClipboardTool | null> {
  if (cachedTool !== undefined) return cachedTool;

  if (process.platform === 'darwin') {
    cachedTool = 'pbpaste';
    return cachedTool;
  }

  // Wayland
  if (process.env['WAYLAND_DISPLAY'] || process.env['XDG_SESSION_TYPE'] === 'wayland') {
    if (await which('wl-paste')) {
      cachedTool = 'wl-paste';
      return cachedTool;
    }
  }

  // X11 fallback
  if (await which('xclip')) {
    cachedTool = 'xclip';
    return cachedTool;
  }

  // Try wl-paste anyway (might work even without WAYLAND_DISPLAY)
  if (await which('wl-paste')) {
    cachedTool = 'wl-paste';
    return cachedTool;
  }

  cachedTool = null;
  return null;
}

async function hasImage(tool: ClipboardTool): Promise<boolean> {
  try {
    switch (tool) {
      case 'wl-paste': {
        const { stdout } = await execFileAsync('wl-paste', ['--list-types']);
        return stdout.split('\n').some(t => t.startsWith('image/'));
      }
      case 'xclip': {
        const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o']);
        return stdout.split('\n').some(t => t.startsWith('image/'));
      }
      case 'pbpaste': {
        const { stdout } = await execFileAsync('osascript', ['-e',
          'tell application "System Events" to return (clipboard info for (clipboard info))'
        ]);
        return stdout.includes('«class PNGf»') || stdout.includes('TIFF');
      }
    }
  } catch {
    return false;
  }
}

async function extractImage(tool: ClipboardTool): Promise<Buffer> {
  switch (tool) {
    case 'wl-paste': {
      const { stdout } = await execFileAsync('wl-paste', ['--type', 'image/png'], { encoding: 'buffer' as any, maxBuffer: 20 * 1024 * 1024 });
      return stdout as unknown as Buffer;
    }
    case 'xclip': {
      const { stdout } = await execFileAsync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o'], { encoding: 'buffer' as any, maxBuffer: 20 * 1024 * 1024 });
      return stdout as unknown as Buffer;
    }
    case 'pbpaste': {
      const script = `
        use framework "AppKit"
        set pb to current application's NSPasteboard's generalPasteboard()
        set imgData to pb's dataForType:(current application's NSPasteboardTypePNG)
        if imgData is missing value then error "No PNG data"
        return (imgData's base64EncodedStringWithOptions:0) as text
      `;
      const { stdout } = await execFileAsync('osascript', ['-l', 'AppleScript', '-e', script], { maxBuffer: 20 * 1024 * 1024 });
      return Buffer.from(stdout.trim(), 'base64');
    }
  }
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function getClipboardImage(): Promise<{ base64: string } | null> {
  const tool = await detectTool();
  if (!tool) {
    throw new Error('No clipboard tool found. Install xclip or wl-paste.');
  }

  if (!(await hasImage(tool))) {
    return null;
  }

  const buf = await extractImage(tool);
  if (buf.length > MAX_SIZE) {
    throw new Error(`Image too large (${(buf.length / 1024 / 1024).toFixed(1)}MB). Max: 10MB`);
  }

  return { base64: buf.toString('base64') };
}
