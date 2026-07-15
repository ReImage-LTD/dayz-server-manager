import 'reflect-metadata';
import { expect } from '../expect';
import { disableConsole, enableConsole } from '../util';
import { DependencyContainer, Lifecycle, container } from 'tsyringe';
import { EventBus } from '../../src/control/event-bus';
import { InternalEventTypes } from '../../src/types/events';
import { OperationStatus } from '../../src/types/operations';
import { Database, Sqlite3Wrapper } from '../../src/services/database';
import {
    OperationConflictError,
    OperationNotFoundError,
    Operations,
    SafeOperationError,
    normalizeOperationError,
} from '../../src/services/operations';

describe('Test class Operations', () => {

    let injector: DependencyContainer;
    let sqlite: Sqlite3Wrapper;
    let operations: Operations;
    let eventBus: EventBus;
    let emitted: number;

    before(() => {
        disableConsole();
    });

    after(() => {
        enableConsole();
    });

    beforeEach(async () => {
        container.reset();
        injector = container.createChildContainer();
        sqlite = new Sqlite3Wrapper(':memory:');
        injector.register(Database, {
            useValue: {
                getDatabase: () => sqlite,
            } as unknown as Database,
        });
        injector.register(EventBus, EventBus, { lifecycle: Lifecycle.Singleton });
        eventBus = injector.resolve(EventBus);
        emitted = 0;
        (eventBus.on as any)(InternalEventTypes.OPERATION_UPDATED, async () => emitted++);
        operations = injector.resolve(Operations);
        await operations.start();
    });

    afterEach(async () => {
        await operations.stop();
        sqlite.close();
    });

    it('persists lifecycle updates and emits events', async () => {
        const queued = operations.createOperation('backup', 'server:primary');
        expect(queued.status).to.equal(OperationStatus.QUEUED);
        expect(queued.progress).to.equal(0);

        const running = operations.startOperation(queued.id);
        expect(running.status).to.equal(OperationStatus.RUNNING);
        expect(running.startedAt).to.be.a('number');

        const progressed = operations.updateProgress(queued.id, 42, 'Copying files');
        expect(progressed.progress).to.equal(42);
        expect(progressed.message).to.equal('Copying files');

        const succeeded = operations.succeedOperation(queued.id);
        expect(succeeded.status).to.equal(OperationStatus.SUCCEEDED);
        expect(succeeded.progress).to.equal(100);
        expect(succeeded.finishedAt).to.be.a('number');
        expect(operations.getOperation(queued.id)).to.deep.equal(succeeded);
        expect(operations.listOperations()).to.deep.equal([succeeded]);
        expect(emitted).to.equal(4);
    });

    it('enforces resource locks until an operation is terminal', () => {
        const first = operations.createOperation('update', 'server:primary');
        expect(() => operations.createOperation('backup', 'server:primary'))
            .to.throw(OperationConflictError)
            .with.property('operation').deep.equal(first);

        operations.failOperation(first.id, new SafeOperationError('UPDATE_FAILED', 'Update failed safely'));
        const next = operations.createOperation('backup', 'server:primary');
        expect(next.id).to.not.equal(first.id);
        expect(operations.getOperation(first.id)?.error).to.deep.equal({
            code: 'UPDATE_FAILED',
            message: 'Update failed safely',
        });
    });

    it('normalizes errors without persisting arbitrary values', () => {
        expect(normalizeOperationError(new Error('Known failure'))).to.deep.equal({
            code: 'OPERATION_FAILED',
            message: 'Operation failed',
        });
        expect(normalizeOperationError({ password: 'secret' })).to.deep.equal({
            code: 'OPERATION_FAILED',
            message: 'Operation failed',
        });
    });

    it('marks queued and running operations interrupted on start', async () => {
        const queued = operations.createOperation('queued');
        const running = operations.createOperation('running');
        operations.startOperation(running.id);

        await operations.start();

        for (const operation of [queued, running]) {
            const interrupted = operations.getOperation(operation.id);
            expect(interrupted?.status).to.equal(OperationStatus.INTERRUPTED);
            expect(interrupted?.error?.code).to.equal('OPERATION_INTERRUPTED');
            expect(interrupted?.finishedAt).to.be.a('number');
        }
    });

    it('validates input, progress, transitions and missing operations', () => {
        expect(() => operations.createOperation('  ')).to.throw('Operation type is required');
        const operation = operations.createOperation('backup', '  ');
        expect(operation.resource).to.be.undefined;
        expect(() => operations.updateProgress(operation.id, 101)).to.throw('between 0 and 100');
        expect(() => operations.succeedOperation(operation.id)).to.throw('cannot transition');
        expect(() => operations.startOperation('missing')).to.throw(OperationNotFoundError);
        operations.startOperation(operation.id);
        expect(() => operations.startOperation(operation.id)).to.throw('cannot transition');
        expect(operations.getOperation('missing')).to.be.undefined;
        expect(operations.listOperations(0)).to.have.length(1);
        expect(operations.listOperations(Number.NaN)).to.have.length(1);
    });

});
