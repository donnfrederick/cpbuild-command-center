/** Human-readable phases for explicit pre-download / resync progress UI. */
export type PreDownloadPhase =
  | "preparing"
  | "fetchingSnapshot"
  | "savingSnapshot"
  | "warmingApis"
  | "warmingPages"
  | "warmingMedia"
  | "finishing"
  | "waiting";

export interface ResyncProgress {
  percent: number;
  phase: PreDownloadPhase;
  /** Optional sub-step for batched work (e.g. API warm 12/45). */
  step?: number;
  stepTotal?: number;
}

export type ResyncProgressCallback = (progress: ResyncProgress) => void;

export interface DownloadProgressState extends ResyncProgress {
  projectId: string;
  projectName?: string;
}
