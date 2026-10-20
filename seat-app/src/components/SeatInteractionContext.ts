import { createContext } from "react";
import type { Category, Participant } from "../types";

export type SeatInteraction = {
  mode: "layout" | "seating";
  selectedTableIds: string[];
  swapFeedback: { seats: { tableId: string; seatIndex: number }[]; generation: number } | null;
  swapFrom: { tableId: string; seatIndex: number } | null;
  selectTable: (tableId: string, additive?: boolean) => void;
  dragTable: (tableId: string, phase: "start" | "move" | "end", x: number, y: number) => void;
  showNames: boolean;
  participants: Participant[];
  categories: Category[];
  selectSeat: (tableId: string, seatIndex: number) => void;
  swapSeat: (tableId: string, seatIndex: number) => void;
};
export const SeatInteractionContext = createContext<SeatInteraction | null>(null);
