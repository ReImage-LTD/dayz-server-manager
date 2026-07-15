import { randomBytes } from 'crypto';
import { EventBus } from '../control/event-bus';
import { InternalEventTypes } from '../types/events';
import { OperationError, OperationStatus, TrackedOperation } from '../types/operations';
import { IStatefulService } from '../types/service';
import { injectable, singleton } from 'tsyringe';
import { Database, DatabaseTypes, Sqlite3Wrapper } from './database';
import { LoggerFactory } from './loggerfactory';

interface OperationRow {
    id: string;
    type: string;
    resource: string | null;
    status: OperationStatus;
    progress: number;
    message: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    createdAt: number;
    updatedAt: number;
    startedAt: number | null;
    finishedAt: number | null;
}

export class OperationConflictError extends Error {

    public constructor(public operation: TrackedOperation) {
        super(`Resource '${operation.resource}' is locked by operation '${operation.id}'`);
        this.name = 'OperationConflictError';
    }

}

export class OperationNotFoundError extends Error {

    public constructor(id: string) {
        super(`Operation '${id}' was not found`);
        this.name = 'OperationNotFoundError';
    }

}

export class SafeOperationError extends Error {

    public constructor(public code: string, message: string) {
        super(message);
        this.name = 'SafeOperationError';
    }

}

export const normalizeOperationError = (error: unknown): OperationError => {
    if (error instanceof SafeOperationError) {
        return {
            code: error.code,
            message: error.message,
        };
    }
    return {
        code: 'OPERATION_FAILED',
        message: 'Operation failed',
    };
};

@singleton()
@injectable()
export class Operations extends IStatefulService {

    public constructor(
        loggerFactory: LoggerFactory,
        private database: Database,
        private eventBus: EventBus,
    ) {
        super(loggerFactory.createLogger('Operations'));
    }

    private get db(): Sqlite3Wrapper {
        return this.database.getDatabase(DatabaseTypes.OPERATIONS);
    }

    public async start(): Promise<void> {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS OPERATIONS (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                resource TEXT,
                status TEXT NOT NULL,
                progress REAL NOT NULL,
                message TEXT,
                errorCode TEXT,
                errorMessage TEXT,
                createdAt UNSIGNED BIG INT NOT NULL,
                updatedAt UNSIGNED BIG INT NOT NULL,
                startedAt UNSIGNED BIG INT,
                finishedAt UNSIGNED BIG INT
            )
        `);
        this.db.run(`
            CREATE UNIQUE INDEX IF NOT EXISTS OPERATIONS_ACTIVE_RESOURCE
            ON OPERATIONS(resource)
            WHERE resource IS NOT NULL AND status IN ('queued', 'running')
        `);

        const inFlight = this.db.all(
            `SELECT * FROM OPERATIONS WHERE status IN (?, ?)`,
            OperationStatus.QUEUED,
            OperationStatus.RUNNING,
        ) as OperationRow[];
        for (const row of inFlight) {
            const now = Date.now();
            this.db.run(
                `UPDATE OPERATIONS SET status = ?, errorCode = ?, errorMessage = ?, updatedAt = ?, finishedAt = ? WHERE id = ?`,
                OperationStatus.INTERRUPTED,
                'OPERATION_INTERRUPTED',
                'Operation interrupted by service restart',
                now,
                now,
                row.id,
            );
            this.emit(this.requireOperation(row.id));
        }
    }

    public async stop(): Promise<void> {
        // The Database service owns the connection lifecycle.
    }

    public createOperation(type: string, resource?: string): TrackedOperation {
        if (!type?.trim()) {
            throw new Error('Operation type is required');
        }
        const normalizedResource = resource?.trim() || undefined;
        if (normalizedResource) {
            const conflicting = this.findActiveForResource(normalizedResource);
            if (conflicting) {
                throw new OperationConflictError(conflicting);
            }
        }

        const now = Date.now();
        const operation: TrackedOperation = {
            id: `${now.toString(36)}-${randomBytes(8).toString('hex')}`,
            type: type.trim(),
            resource: normalizedResource,
            status: OperationStatus.QUEUED,
            progress: 0,
            createdAt: now,
            updatedAt: now,
        };
        try {
            this.db.run(
                `INSERT INTO OPERATIONS (id, type, resource, status, progress, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                operation.id,
                operation.type,
                operation.resource ?? null,
                operation.status,
                operation.progress,
                operation.createdAt,
                operation.updatedAt,
            );
        } catch (error) {
            const conflicting = normalizedResource && this.findActiveForResource(normalizedResource);
            if (conflicting) {
                throw new OperationConflictError(conflicting);
            }
            throw error;
        }
        this.emit(operation);
        return operation;
    }

    public startOperation(id: string): TrackedOperation {
        const operation = this.requireOperation(id);
        this.requireStatus(operation, [OperationStatus.QUEUED]);
        const now = Date.now();
        this.db.run(
            `UPDATE OPERATIONS SET status = ?, updatedAt = ?, startedAt = ? WHERE id = ?`,
            OperationStatus.RUNNING,
            now,
            now,
            id,
        );
        return this.emitUpdated(id);
    }

    public updateProgress(id: string, progress: number, message?: string): TrackedOperation {
        if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
            throw new Error('Operation progress must be between 0 and 100');
        }
        const operation = this.requireOperation(id);
        this.requireStatus(operation, [OperationStatus.RUNNING]);
        this.db.run(
            `UPDATE OPERATIONS SET progress = ?, message = ?, updatedAt = ? WHERE id = ?`,
            progress,
            message ?? null,
            Date.now(),
            id,
        );
        return this.emitUpdated(id);
    }

    public succeedOperation(id: string, message?: string): TrackedOperation {
        const operation = this.requireOperation(id);
        this.requireStatus(operation, [OperationStatus.RUNNING]);
        const now = Date.now();
        this.db.run(
            `UPDATE OPERATIONS SET status = ?, progress = ?, message = ?, updatedAt = ?, finishedAt = ? WHERE id = ?`,
            OperationStatus.SUCCEEDED,
            100,
            message ?? operation.message ?? null,
            now,
            now,
            id,
        );
        return this.emitUpdated(id);
    }

    public failOperation(id: string, error: unknown): TrackedOperation {
        const operation = this.requireOperation(id);
        this.requireStatus(operation, [OperationStatus.QUEUED, OperationStatus.RUNNING]);
        const normalizedError = normalizeOperationError(error);
        const now = Date.now();
        this.db.run(
            `UPDATE OPERATIONS SET status = ?, errorCode = ?, errorMessage = ?, updatedAt = ?, finishedAt = ? WHERE id = ?`,
            OperationStatus.FAILED,
            normalizedError.code,
            normalizedError.message,
            now,
            now,
            id,
        );
        return this.emitUpdated(id);
    }

    public getOperation(id: string): TrackedOperation | undefined {
        const row = this.db.first(`SELECT * FROM OPERATIONS WHERE id = ?`, id) as OperationRow | undefined;
        return row && this.fromRow(row);
    }

    public listOperations(limit: number = 100): TrackedOperation[] {
        const normalizedLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(1000, Math.floor(limit)))
            : 100;
        return (this.db.all(
            `SELECT * FROM OPERATIONS ORDER BY createdAt DESC LIMIT ?`,
            normalizedLimit,
        ) as OperationRow[]).map((row) => this.fromRow(row));
    }

    private findActiveForResource(resource: string): TrackedOperation | undefined {
        const row = this.db.first(
            `SELECT * FROM OPERATIONS WHERE resource = ? AND status IN (?, ?) ORDER BY createdAt DESC LIMIT 1`,
            resource,
            OperationStatus.QUEUED,
            OperationStatus.RUNNING,
        ) as OperationRow | undefined;
        return row && this.fromRow(row);
    }

    private requireOperation(id: string): TrackedOperation {
        const operation = this.getOperation(id);
        if (!operation) {
            throw new OperationNotFoundError(id);
        }
        return operation;
    }

    private requireStatus(operation: TrackedOperation, allowed: OperationStatus[]): void {
        if (!allowed.includes(operation.status)) {
            throw new Error(`Operation '${operation.id}' cannot transition from '${operation.status}'`);
        }
    }

    private emitUpdated(id: string): TrackedOperation {
        const operation = this.requireOperation(id);
        this.emit(operation);
        return operation;
    }

    private emit(operation: TrackedOperation): void {
        this.eventBus.emit(InternalEventTypes.OPERATION_UPDATED, operation);
    }

    private fromRow(row: OperationRow): TrackedOperation {
        const operation: TrackedOperation = {
            id: row.id,
            type: row.type,
            status: row.status,
            progress: row.progress,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
        if (row.resource !== null) operation.resource = row.resource;
        if (row.message !== null) operation.message = row.message;
        if (row.errorCode) {
            operation.error = {
                code: row.errorCode,
                message: row.errorMessage || 'Operation failed',
            };
        }
        if (row.startedAt !== null) operation.startedAt = row.startedAt;
        if (row.finishedAt !== null) operation.finishedAt = row.finishedAt;
        return operation;
    }

}
