export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface ApiError {
  error: string;
  /** Single error message (e.g. exception message). Use `details` for validation field errors. */
  detail?: string;
  details?: Record<string, string[]>;
}

export interface ApiSuccess<T = unknown> {
  data: T;
  message?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
