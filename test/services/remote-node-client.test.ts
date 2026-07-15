import 'reflect-metadata';
import { expect } from '../expect';
import { EventEmitter } from 'events';
import * as sinon from 'sinon';
import { RemoteNodeClient } from '../../src/services/remote-node-client';
import { HTTPSAPI } from '../../src/util/apis';

type MockClientRequest = EventEmitter & {
    setTimeout: sinon.SinonStub;
    destroy: sinon.SinonStub;
    end: sinon.SinonStub;
};

const createHttps = (
    statusCode: number,
    responseBody: string,
): { https: HTTPSAPI, request: sinon.SinonStub, clientRequest: MockClientRequest } => {
    const request = sinon.stub();
    const clientRequest: MockClientRequest = Object.assign(new EventEmitter(), {
        setTimeout: sinon.stub(),
        destroy: sinon.stub(),
        end: sinon.stub(),
    });
    clientRequest.end.callsFake(() => {
        const response = Object.assign(new EventEmitter(), { statusCode });
        const callback = request.firstCall.args[2];
        callback(response);
        if (responseBody) {
            response.emit('data', Buffer.from(responseBody));
        }
        response.emit('end');
    });
    request.returns(clientRequest);
    return {
        https: { request } as any as HTTPSAPI,
        request,
        clientRequest,
    };
};

describe('Test RemoteNodeClient', () => {

    it('signs, expires, and prevents replay of command envelopes', () => {
        const client = new RemoteNodeClient(createHttps(200, '').https);
        const command = {
            resource: 'status',
            method: 'post' as const,
            body: { z: 1, a: [2, 3] },
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };
        const envelope = client.createEnvelope('node', command, 'secret', 1000, 100);

        expect(envelope.nonce).to.have.length(32);
        expect(client.verifyEnvelope(envelope, 'secret', 500)).to.be.true;
        expect(client.verifyEnvelope(envelope, 'secret', 500)).to.be.false;

        const expired = client.createEnvelope('node', command, 'secret', 1000, 100);
        expect(client.verifyEnvelope(expired, 'secret', 1100)).to.be.false;
        const future = client.createEnvelope('node', command, 'secret', 1000, 100);
        expect(client.verifyEnvelope(future, 'secret', 99)).to.be.false;
        const tampered = client.createEnvelope('node', command, 'secret', 1000, 100);
        tampered.command = { ...command, resource: 'restart' };
        expect(client.verifyEnvelope(tampered, 'secret', 500)).to.be.false;
        expect(() => client.createEnvelope('node', command, 'secret', 0)).to.throw('positive');
    });

    it('verifies envelopes after JSON transport removes undefined fields', () => {
        const client = new RemoteNodeClient(createHttps(200, '').https);
        const envelope = client.createEnvelope('node', {
            resource: 'serverinfo',
            method: 'get',
            body: undefined,
            query: undefined,
            authorizationLevel: 'view',
            requestedBy: 'operator',
        }, 'secret', 1000, 100, 'source');
        const transported = JSON.parse(JSON.stringify(envelope));

        expect(client.verifyEnvelope(transported, 'secret', 500, 'node')).to.be.true;
    });

    it('handles verified envelopes through a transport callback', async () => {
        const client = new RemoteNodeClient(createHttps(200, '').https);
        const command = {
            resource: 'status',
            method: 'get' as const,
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };
        const envelope = client.createEnvelope('node', command, 'secret', 1000, 100);
        const transport = sinon.stub().resolves({ status: 200 });

        expect(await client.handleEnvelope(envelope, 'secret', transport, 500)).to.deep.equal({ status: 200 });
        expect(transport).to.have.been.calledOnceWith(command);
        await expect(client.handleEnvelope(envelope, 'secret', transport, 500)).to.be.rejectedWith('replayed');
    });

    it('posts signed JSON without forwarding authorization', async () => {
        const fake = createHttps(200, '{"status":200}');
        const client = new RemoteNodeClient(fake.https);
        const result = await client.execute<{ status: number }>({
            id: 'remote',
            name: 'Remote',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: [],
        }, {
            resource: 'status',
            method: 'get',
            authorizationLevel: 'view',
            requestedBy: 'admin',
        }, 'secret', { timeoutMs: 500, envelopeLifetimeMs: 1000 });

        expect(result.status).to.equal(200);
        const options = fake.request.firstCall.args[1];
        expect(options.method).to.equal('POST');
        expect(options.headers.authorization).to.be.undefined;
        expect(fake.clientRequest.setTimeout).to.have.been.calledWith(500);
        const envelope = JSON.parse(fake.clientRequest.end.firstCall.args[0]);
        expect(envelope.signature).to.match(/^[a-f0-9]{64}$/);
    });

    it('handles text, empty, and failed responses', async () => {
        const descriptor = {
            id: 'remote',
            name: 'Remote',
            type: 'remote' as const,
            endpoint: 'https://node.example/fleet',
            capabilities: [],
        };
        const command = {
            resource: 'status',
            method: 'get' as const,
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };

        expect(await new RemoteNodeClient(createHttps(200, 'ok').https).execute(descriptor, command, 'secret')).to.equal('ok');
        expect(await new RemoteNodeClient(createHttps(204, '').https).execute(descriptor, command, 'secret')).to.be.undefined;
        await expect(new RemoteNodeClient(createHttps(500, 'failed').https).execute(descriptor, command, 'secret'))
            .to.be.rejectedWith('HTTP 500');
    });

    it('rejects unsafe endpoints and invalid timeouts', async () => {
        const client = new RemoteNodeClient(createHttps(200, '').https);
        const descriptor = {
            id: 'remote',
            name: 'Remote',
            type: 'remote' as const,
            endpoint: 'ftp://node.example/fleet',
            capabilities: [],
        };
        const command = {
            resource: 'status',
            method: 'get' as const,
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };

        await expect(client.execute(descriptor, command, 'secret')).to.be.rejectedWith('Unsupported');
        await expect(client.execute({
            ...descriptor,
            endpoint: 'https://user:password@node.example/fleet',
        }, command, 'secret')).to.be.rejectedWith('credentials');
        await expect(client.execute({
            ...descriptor,
            endpoint: 'https://node.example/fleet',
        }, command, 'secret', { timeoutMs: 0 })).to.be.rejectedWith('timeout must be positive');
    });

    it('destroys timed out requests', async () => {
        const fake = createHttps(200, '');
        fake.clientRequest.end.resetBehavior();
        fake.clientRequest.setTimeout.callsFake((_timeout, callback) => callback());
        fake.clientRequest.destroy.callsFake((error) => fake.clientRequest.emit('error', error));
        const client = new RemoteNodeClient(fake.https);

        await expect(client.execute({
            id: 'remote',
            name: 'Remote',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: [],
        }, {
            resource: 'status',
            method: 'get',
            authorizationLevel: 'view',
            requestedBy: 'admin',
        }, 'secret', { timeoutMs: 10 })).to.be.rejectedWith('timed out');
        expect(fake.clientRequest.destroy).to.have.been.calledOnce;
    });

});
