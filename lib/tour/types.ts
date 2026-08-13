/**
 * Shared types for the Tour Simulation Engine.
 *
 * TourStep extends the basic step shape with an optional actions[] array that
 * drives the simulation cursor (click, type, navigate, etc.).
 *
 * MockFixture defines fake API responses that are returned during tour mode so
 * mutation API calls (POST/PATCH/PUT/DELETE) never touch the real database.
 */

export type TourAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; label?: string }
  | {
      type: "type";
      selector: string;
      text: string;
      clearFirst?: boolean;
      label?: string;
    }
  | { type: "hover"; selector: string; label?: string }
  | { type: "wait"; ms: number }
  | { type: "scroll"; selector: string; behavior?: "smooth" | "instant" };

export interface TourStep {
  order: number;
  pageUrl: string;
  elementSelector: string;
  title: string;
  description: string;
  voiceText: string;
  actions?: TourAction[];
}

export interface MockFixture {
  match: {
    method: "POST" | "PATCH" | "PUT" | "DELETE";
    urlPattern: RegExp | string;
  };
  response: {
    status: number;
    body: Record<string, unknown>;
    delay?: number;
  };
}

export type CursorActionState = "idle" | "moving" | "clicking" | "typing";

export interface TourStartPayload {
  feedbackId?: string;
  releaseId?: string;
  siteTour?: boolean;
  autoPlay?: boolean;
  fixtures?: MockFixture[];
}

export interface ActiveTourState {
  feedbackId?: string;
  releaseId?: string;
  siteTour?: boolean;
  steps: TourStep[];
  currentIndex: number;
  autoPlay: boolean;
  speedMultiplier: number;
}
