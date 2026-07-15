/* istanbul ignore file */

// eslint-disable-next-line no-shadow
export enum OperationStatus {
    QUEUED = 'queued',
    RUNNING = 'running',
    SUCCEEDED = 'succeeded',
    FAILED = 'failed',
    INTERRUPTED = 'interrupted',
}

export interface OperationError {
    code: string;
    message: string;
}

export interface TrackedOperation {
    id: string;
    type: string;
    resource?: string;
    status: OperationStatus;
    progress: number;
    message?: string;
    error?: OperationError;
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    finishedAt?: number;
}
