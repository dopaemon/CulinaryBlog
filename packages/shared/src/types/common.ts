export type SortOrder = 'asc' | 'desc';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface PagedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/** RFC 7807 Problem Details */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  /** Field name -> validation messages */
  errors?: Record<string, string[]>;
  traceId?: string;
}
