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
    const handler = (data: string | Buffer) => {
      if (optionsRef.current.disabled) return;

      const isCtrlV =
        typeof data === 'string'
          ? data.length === 1 && data.charCodeAt(0) === 0x16
          : data.length === 1 && data[0] === 0x16;

      if (!isCtrlV) return;

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
