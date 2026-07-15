import { UserLevel } from '../config/config';

export type FleetNodeCapability = string;

export interface FleetNodeDescriptorBase {
    id: string;
    name: string;
    capabilities: FleetNodeCapability[];
}

export interface LocalFleetNodeDescriptor extends FleetNodeDescriptorBase {
    type: 'local';
}

export interface RemoteFleetNodeDescriptor extends FleetNodeDescriptorBase {
    type: 'remote';
    endpoint: string;
    authorizationLevel?: UserLevel;
}

export type FleetNodeDescriptor = LocalFleetNodeDescriptor | RemoteFleetNodeDescriptor;

export interface FleetNodeStatus {
    descriptor: FleetNodeDescriptor;
    online: boolean;
    lastSeenAt?: number;
}

export interface FleetCommand {
    resource: string;
    method: 'get' | 'post' | 'put' | 'delete';
    body?: unknown;
    query?: Record<string, unknown>;
    requiredCapability?: FleetNodeCapability;
    authorizationLevel: UserLevel;
    requestedBy: string;
}

export interface SignedFleetCommandEnvelope {
    version: 1;
    nodeId: string;
    sourceNodeId: string;
    issuedAt: number;
    expiresAt: number;
    nonce: string;
    command: FleetCommand;
    signature: string;
}

export type FleetCommandTransport<TResult = unknown> = (command: FleetCommand) => Promise<TResult>;
