import { injectable, singleton } from 'tsyringe';
import { FleetNodeDescriptor, FleetNodeStatus, LocalFleetNodeDescriptor, RemoteFleetNodeDescriptor } from '../types/fleet';

interface RegisteredFleetNode {
    status: FleetNodeStatus;
    sharedSecret?: string;
}

@singleton()
@injectable()
export class NodeRegistry {

    private nodes: Map<string, RegisteredFleetNode> = new Map();

    public registerLocal(descriptor: LocalFleetNodeDescriptor): FleetNodeStatus {
        return this.register(descriptor, true);
    }

    public registerRemote(descriptor: RemoteFleetNodeDescriptor, sharedSecret: string): FleetNodeStatus {
        if (!sharedSecret) {
            throw new Error(`Remote fleet node '${descriptor.id}' requires a shared secret`);
        }
        const endpoint = this.normalizeEndpoint(descriptor.endpoint);
        for (const node of this.nodes.values()) {
            if (node.status.descriptor.type === 'remote'
                && this.normalizeEndpoint(node.status.descriptor.endpoint) === endpoint) {
                throw new Error(`Fleet node endpoint '${descriptor.endpoint}' is already registered`);
            }
        }
        return this.register(descriptor, false, sharedSecret);
    }

    public remove(nodeId: string): boolean {
        return this.nodes.delete(nodeId);
    }

    public get(nodeId: string): FleetNodeStatus | undefined {
        const node = this.nodes.get(nodeId);
        return node ? this.copyStatus(node.status) : undefined;
    }

    public list(): FleetNodeStatus[] {
        return Array.from(this.nodes.values(), (node) => this.copyStatus(node.status));
    }

    public getLocal(): FleetNodeStatus | undefined {
        const local = Array.from(this.nodes.values()).find((node) => node.status.descriptor.type === 'local');
        return local ? this.copyStatus(local.status) : undefined;
    }

    public setOnline(nodeId: string, online: boolean, timestamp: number = Date.now()): FleetNodeStatus {
        const node = this.requireNode(nodeId);
        node.status.online = online;
        if (online) {
            node.status.lastSeenAt = timestamp;
        }
        return this.copyStatus(node.status);
    }

    public supports(nodeId: string, capability: string): boolean {
        return this.requireNode(nodeId).status.descriptor.capabilities.includes(capability);
    }

    public getRemoteSecret(nodeId: string): string {
        const node = this.requireNode(nodeId);
        if (node.status.descriptor.type !== 'remote' || !node.sharedSecret) {
            throw new Error(`Fleet node '${nodeId}' is not remote`);
        }
        return node.sharedSecret;
    }

    private register(descriptor: FleetNodeDescriptor, online: boolean, sharedSecret?: string): FleetNodeStatus {
        if (!descriptor.id.trim()) {
            throw new Error('Fleet node id cannot be empty');
        }
        if (this.nodes.has(descriptor.id)) {
            throw new Error(`Fleet node '${descriptor.id}' is already registered`);
        }
        const status: FleetNodeStatus = {
            descriptor: this.copyDescriptor(descriptor),
            online,
        };
        if (online) {
            status.lastSeenAt = Date.now();
        }
        this.nodes.set(descriptor.id, { status, sharedSecret });
        return this.copyStatus(status);
    }

    private requireNode(nodeId: string): RegisteredFleetNode {
        const node = this.nodes.get(nodeId);
        if (!node) {
            throw new Error(`Unknown fleet node '${nodeId}'`);
        }
        return node;
    }

    private copyStatus(status: FleetNodeStatus): FleetNodeStatus {
        return {
            descriptor: this.copyDescriptor(status.descriptor),
            online: status.online,
            lastSeenAt: status.lastSeenAt,
        };
    }

    private copyDescriptor(descriptor: FleetNodeDescriptor): FleetNodeDescriptor {
        const base = {
            id: descriptor.id,
            name: descriptor.name,
            capabilities: [...descriptor.capabilities],
        };
        return descriptor.type === 'local'
            ? { ...base, type: descriptor.type }
            : {
                ...base,
                type: descriptor.type,
                endpoint: descriptor.endpoint,
                authorizationLevel: descriptor.authorizationLevel,
            };
    }

    private normalizeEndpoint(endpoint: string): string {
        const url = new URL(endpoint);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error(`Unsupported fleet node protocol '${url.protocol}'`);
        }
        if (url.username || url.password) {
            throw new Error('Fleet node endpoints cannot contain credentials');
        }
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    }

}
