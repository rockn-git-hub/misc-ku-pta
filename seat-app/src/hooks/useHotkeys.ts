// src/hooks/useHotkeys.ts
import { useEffect } from "react";

type UseHotkeysProps = {
  isSeatModalOpen: boolean;
  selectedId: string | null;
  copyTable: (id: string) => void;
  deleteTable: (id: string) => void;
};

export function useHotkeys({
  isSeatModalOpen,
  selectedId,
  copyTable,
  deleteTable,
}: UseHotkeysProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // もし入力中の要素が input/textarea なら無効化
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        (target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case "c":
            e.preventDefault();
            if (selectedId) copyTable(selectedId);
            break;
        }
      } else {
        switch (e.key) {
          case "Delete":
            e.preventDefault();
            if (selectedId) deleteTable(selectedId);
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSeatModalOpen, selectedId, copyTable, deleteTable]);
}
