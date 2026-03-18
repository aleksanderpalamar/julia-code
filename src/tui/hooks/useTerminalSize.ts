import { useState, useEffect, useRef } from "react";

interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSize({
          columns: process.stdout.columns || 80,
          rows: process.stdout.rows || 24,
        });
      }, 100);
    };

    process.stdout.on("resize", handleResize);
    return () => {
      process.stdout.off("resize", handleResize);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return size;
}
