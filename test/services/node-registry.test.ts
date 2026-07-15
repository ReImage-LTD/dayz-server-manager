import 'reflect-metadata';
import { expect } from '../expect';
import { NodeRegistry } from '../../src/services/node-registry';

describe('Test NodeRegistry', () => {

    it('registers nodes, tracks state, and keeps secrets private', () => {
        const registry = new NodeRegistry();
        const local = registry.registerLocal({
            id: 'local',
            name: 'Local server',
            type: 'local',
            capabilities: ['server'],
        });
        const remote = registry.registerRemote({
            id: 'remote',
            name: 'Remote server',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: ['server', 'mods'],
        }, 'secret');

        expect(local.online).to.be.true;
        expect(local.lastSeenAt).to.be.a('number');
        expect(remote.online).to.be.false;
        expect(registry.supports('remote', 'mods')).to.be.true;
        expect(registry.getRemoteSecret('remote')).to.equal('secret');
        expect(registry.setOnline('remote', true, 1234).lastSeenAt).to.equal(1234);
        expect(registry.list()).to.have.length(2);
        expect(registry.remove('remote')).to.be.true;
        expect(registry.remove('remote')).to.be.false;
    });

    it('rejects duplicate and invalid registrations', () => {
        const registry = new NodeRegistry();
        registry.registerRemote({
            id: 'one',
            name: 'One',
            type: 'remote',
            endpoint: 'https://node.example/fleet/',
            capabilities: [],
        }, 'secret');

        expect(() => registry.registerRemote({
            id: 'two',
            name: 'Two',
            type: 'remote',
            endpoint: 'https://node.example/fleet',
            capabilities: [],
        }, 'secret')).to.throw('already registered');
        expect(() => registry.registerLocal({
            id: 'one',
            name: 'Duplicate',
            type: 'local',
            capabilities: [],
        })).to.throw('already registered');
        expect(() => registry.registerRemote({
            id: 'three',
            name: 'No secret',
            type: 'remote',
            endpoint: 'https://other.example/fleet',
            capabilities: [],
        }, '')).to.throw('shared secret');
        expect(() => registry.registerRemote({
            id: 'unsafe',
            name: 'Unsafe',
            type: 'remote',
            endpoint: 'https://user:password@node.example/fleet',
            capabilities: [],
        }, 'secret')).to.throw('credentials');
        expect(() => registry.registerLocal({
            id: ' ',
            name: 'Empty',
            type: 'local',
            capabilities: [],
        })).to.throw('cannot be empty');
        expect(() => registry.getRemoteSecret('one-local')).to.throw('Unknown');
        expect(() => registry.getRemoteSecret('one')).not.to.throw();
    });

    it('returns copies of descriptors', () => {
        const registry = new NodeRegistry();
        const descriptor = {
            id: 'local',
            name: 'Local',
            type: 'local' as const,
            capabilities: ['server'],
        };
        registry.registerLocal(descriptor);
        descriptor.capabilities.push('changed');
        const status = registry.get('local');
        status?.descriptor.capabilities.push('also-changed');

        expect(registry.get('local')?.descriptor.capabilities).to.deep.equal(['server']);
        expect(() => registry.getRemoteSecret('local')).to.throw('not remote');
        expect(() => registry.setOnline('missing', true)).to.throw('Unknown');
    });

});
