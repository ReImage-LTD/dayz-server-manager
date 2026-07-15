import 'reflect-metadata';
import { expect } from '../expect';
import * as sinon from 'sinon';
import { FleetDispatcher } from '../../src/services/fleet-dispatcher';
import { NodeRegistry } from '../../src/services/node-registry';
import { RemoteNodeClient } from '../../src/services/remote-node-client';

describe('Test FleetDispatcher', () => {

    it('dispatches local commands through the supplied transport', async () => {
        const registry = new NodeRegistry();
        registry.registerLocal({
            id: 'local',
            name: 'Local',
            type: 'local',
            capabilities: ['server'],
        });
        const remoteClient = { execute: sinon.stub() } as any as RemoteNodeClient;
        const dispatcher = new FleetDispatcher(registry, remoteClient);
        const transport = sinon.stub().resolves({ status: 200 });
        const command = {
            resource: 'status',
            method: 'get' as const,
            requiredCapability: 'server',
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };

        expect(await dispatcher.dispatch('local', command, transport)).to.deep.equal({ status: 200 });
        expect(transport).to.have.been.calledOnceWith(command);
        expect(remoteClient.execute).not.to.have.been.called;
    });

    it('dispatches online remote commands through the client', async () => {
        const registry = new NodeRegistry();
        registry.registerLocal({
            id: 'local',
            name: 'Local',
            type: 'local',
            capabilities: ['*'],
        });
        registry.registerRemote({
            id: 'remote',
            name: 'Remote',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: ['server'],
        }, 'secret');
        registry.setOnline('remote', true);
        const remoteClient = { execute: sinon.stub().resolves('result') } as any as RemoteNodeClient;
        const dispatcher = new FleetDispatcher(registry, remoteClient);
        const command = {
            resource: 'status',
            method: 'get' as const,
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };

        expect(await dispatcher.dispatch('remote', command, sinon.stub().resolves())).to.equal('result');
        expect(remoteClient.execute).to.have.been.calledOnce;
        expect(remoteClient.execute).to.have.been.calledWith(sinon.match({ id: 'remote' }), command, 'secret');
    });

    it('probes offline nodes and rejects unknown or incapable nodes', async () => {
        const registry = new NodeRegistry();
        registry.registerLocal({
            id: 'local',
            name: 'Local',
            type: 'local',
            capabilities: ['*'],
        });
        registry.registerRemote({
            id: 'remote',
            name: 'Remote',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: [],
        }, 'secret');
        const dispatcher = new FleetDispatcher(registry, { execute: sinon.stub() } as any as RemoteNodeClient);
        const transport = sinon.stub().resolves();

        const command = {
            resource: 'status',
            method: 'get' as const,
            authorizationLevel: 'view' as const,
            requestedBy: 'admin',
        };
        await expect(dispatcher.dispatch('missing', command, transport)).to.be.rejectedWith('Unknown');
        await dispatcher.dispatch('remote', command, transport);
        expect(registry.get('remote')?.online).to.be.true;
        registry.setOnline('remote', true);
        await expect(dispatcher.dispatch('remote', {
            ...command,
            requiredCapability: 'server',
        }, transport)).to.be.rejectedWith('does not support');
    });

});
