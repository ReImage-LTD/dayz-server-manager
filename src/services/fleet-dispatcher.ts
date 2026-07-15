import { injectable, singleton } from 'tsyringe';
import { FleetCommand, FleetCommandTransport } from '../types/fleet';
import { NodeRegistry } from './node-registry';
import { RemoteNodeClient, RemoteNodeClientOptions } from './remote-node-client';

@singleton()
@injectable()
export class FleetDispatcher {

    public constructor(
        private nodeRegistry: NodeRegistry,
        private remoteNodeClient: RemoteNodeClient,
    ) {}

    public async dispatch<TResult = unknown>(
        nodeId: string,
        command: FleetCommand,
        localTransport: FleetCommandTransport<TResult>,
        remoteOptions?: RemoteNodeClientOptions,
    ): Promise<TResult> {
        const status = this.nodeRegistry.get(nodeId);
        if (!status) {
            throw new Error(`Unknown fleet node '${nodeId}'`);
        }
        if (command.requiredCapability
            && !status.descriptor.capabilities.includes('*')
            && !status.descriptor.capabilities.includes(command.requiredCapability)) {
            throw new Error(`Fleet node '${nodeId}' does not support '${command.requiredCapability}'`);
        }
        if (status.descriptor.type === 'local') {
            return localTransport(command);
        }
        const local = this.nodeRegistry.getLocal();
        if (!local) {
            throw new Error('Local fleet node is not registered');
        }
        const options = {
            ...remoteOptions,
            sourceNodeId: local.descriptor.id,
        };
        try {
            if (!status.online) {
                // Offline is the initial/last-failure state; a signed health call can recover it.
                await this.remoteNodeClient.execute(
                    status.descriptor,
                    {
                        resource: 'fleethealth',
                        method: 'get',
                        authorizationLevel: 'view',
                        requestedBy: 'fleet-health',
                    },
                    this.nodeRegistry.getRemoteSecret(nodeId),
                    options,
                );
            }
            const result = await this.remoteNodeClient.execute<TResult>(
                status.descriptor,
                command,
                this.nodeRegistry.getRemoteSecret(nodeId),
                options,
            );
            this.nodeRegistry.setOnline(nodeId, true);
            return result;
        } catch (error) {
            this.nodeRegistry.setOnline(nodeId, false);
            throw error;
        }
    }

}
