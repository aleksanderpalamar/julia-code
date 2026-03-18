import { useEffect, useRef } from 'react';
import { getClipboardImage } from '../clipboard.js';

interface ClipboardPasteOptions {
  onImagePasted: (base64: string, name: string) => void;
  onError: (msg: string) => void;
  disabled: boolean;
}

export function useClipboardPaste(options: ClipboardPasteOptions): {
  pasteInProgress: React.MutableRefObject<boolean>;
} {
  const pasteInProgress = useRef(false);
  const counterRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Ink sets stdin.setEncoding('utf8'), so data arrives as string, not Buffer.
    // Ctrl+V in raw mode = character U+0016 (0x16).
    const handler = (data: string | Buffer) => {
      if (optionsRef.current.disabled) return;

      const isCtrlV =
        typeof data === 'string'
          ? data.length === 1 && data.charCodeAt(0) === 0x16
          : data.length === 1 && data[0] === 0x16;

      if (!isCtrlV) return;

      // Set flag synchronously BEFORE Ink processes the same event,
      // so Input's handleChange can suppress the spurious 'v'.
      pasteInProgress.current = true;

      getClipboardImage()
        .then(result => {
          if (result) {
            counterRef.current++;
            optionsRef.current.onImagePasted(
              result.base64,
              `clipboard-${counterRef.current}.png`,
            );
          } else {
            // No image in clipboard — reset flag so next keystroke isn't swallowed
            pasteInProgress.current = false;
          }
        })
        .catch(err => {
          pasteInProgress.current = false;
          optionsRef.current.onError(
            err instanceof Error ? err.message : String(err),
          );
        });
    };

    process.stdin.prependListener('data', handler);
    return () => {
      process.stdin.removeListener('data', handler);
    };
  }, []);

  return { pasteInProgress };
}
