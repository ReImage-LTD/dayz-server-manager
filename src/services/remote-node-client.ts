import * as http from 'http';
import { ClientRequest, IncomingMessage, RequestOptions } from 'http';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { inject, injectable, singleton } from 'tsyringe';
import { FleetCommand, FleetCommandTransport, RemoteFleetNodeDescriptor, SignedFleetCommandEnvelope } from '../types/fleet';
import { HTTPSAPI, InjectionTokens } from '../util/apis';

export interface RemoteNodeClientOptions {
    timeoutMs?: number;
    envelopeLifetimeMs?: number;
    sourceNodeId?: string;
}

@singleton()
@injectable()
export class RemoteNodeClient {

    private verifiedNonces: Map<string, number> = new Map();

    public constructor(
        @inject(InjectionTokens.https) private https: HTTPSAPI,
    ) {}

    public createEnvelope(
        nodeId: string,
        command: FleetCommand,
        sharedSecret: string,
        lifetimeMs: number = 30000,
        now: number = Date.now(),
        sourceNodeId: string = nodeId,
    ): SignedFleetCommandEnvelope {
        if (lifetimeMs <= 0) {
            throw new Error('Fleet command envelope lifetime must be positive');
        }
        const unsigned = {
            version: 1 as const,
            nodeId,
            sourceNodeId,
            issuedAt: now,
            expiresAt: now + lifetimeMs,
            nonce: randomBytes(16).toString('hex'),
            command,
        };
        return {
            ...unsigned,
            signature: this.sign(unsigned, sharedSecret),
        };
    }

    public verifyEnvelope(
        envelope: SignedFleetCommandEnvelope,
        sharedSecret: string,
        now: number = Date.now(),
        expectedNodeId?: string,
    ): boolean {
        if (envelope.version !== 1
            || !envelope.sourceNodeId
            || (!!expectedNodeId && envelope.nodeId !== expectedNodeId)
            || envelope.expiresAt <= now
            || envelope.expiresAt <= envelope.issuedAt
            || envelope.expiresAt - envelope.issuedAt > 60000
            || envelope.issuedAt > now
            || !/^[a-f0-9]{32}$/.test(envelope.nonce)
            || !/^[a-f0-9]{64}$/.test(envelope.signature)) {
            return false;
        }
        const expected = this.sign({
            version: envelope.version,
            nodeId: envelope.nodeId,
            sourceNodeId: envelope.sourceNodeId,
            issuedAt: envelope.issuedAt,
            expiresAt: envelope.expiresAt,
            nonce: envelope.nonce,
            command: envelope.command,
        }, sharedSecret);
        const actualBuffer = Buffer.from(envelope.signature, 'hex');
        const expectedBuffer = Buffer.from(expected, 'hex');
        if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
            return false;
        }
        for (const [nonce, expiresAt] of this.verifiedNonces) {
            if (expiresAt <= now) {
                this.verifiedNonces.delete(nonce);
            }
        }
        if (this.verifiedNonces.has(envelope.nonce)) {
            return false;
        }
        this.verifiedNonces.set(envelope.nonce, envelope.expiresAt);
        return true;
    }

    public handleEnvelope<TResult = unknown>(
        envelope: SignedFleetCommandEnvelope,
        sharedSecret: string,
        transport: FleetCommandTransport<TResult>,
        now: number = Date.now(),
        expectedNodeId?: string,
    ): Promise<TResult> {
        if (!this.verifyEnvelope(envelope, sharedSecret, now, expectedNodeId)) {
            return Promise.reject(new Error('Invalid, expired, or replayed fleet command envelope'));
        }
        return transport(envelope.command);
    }

    public async execute<TResult = unknown>(
        node: RemoteFleetNodeDescriptor,
        command: FleetCommand,
        sharedSecret: string,
        options: RemoteNodeClientOptions = {},
    ): Promise<TResult> {
        const endpoint = new URL(node.endpoint);
        if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
            throw new Error(`Unsupported fleet node protocol '${endpoint.protocol}'`);
        }
        if (endpoint.username || endpoint.password) {
            throw new Error('Fleet node endpoints cannot contain credentials');
        }

        const envelope = this.createEnvelope(
            node.id,
            command,
            sharedSecret,
            options.envelopeLifetimeMs,
            Date.now(),
            options.sourceNodeId,
        );
        const body = JSON.stringify(envelope);
        const response = await this.request(endpoint, body, options.timeoutMs ?? 10000);
        if (!response.body) {
            return undefined as TResult;
        }
        try {
            return JSON.parse(response.body) as TResult;
        } catch (_) {
            return response.body as unknown as TResult;
        }
    }

    private request(url: URL, body: string, timeoutMs: number): Promise<{ statusCode: number, body: string }> {
        if (timeoutMs <= 0) {
            return Promise.reject(new Error('Remote fleet node timeout must be positive'));
        }
        return new Promise((resolve, reject) => {
            const requestOptions: RequestOptions = {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                },
            };
            const callback = (response: IncomingMessage): void => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                response.on('error', reject);
                response.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString();
                    const statusCode = response.statusCode ?? 0;
                    if (statusCode < 200 || statusCode >= 300) {
                        reject(new Error(`Remote fleet node returned HTTP ${statusCode}: ${responseBody}`));
                        return;
                    }
                    resolve({ statusCode, body: responseBody });
                });
            };
            const request: ClientRequest = url.protocol === 'https:'
                ? this.https.request(url, requestOptions, callback)
                : http.request(url, requestOptions, callback);
            request.setTimeout(timeoutMs, () => {
                request.destroy(new Error(`Remote fleet node request timed out after ${timeoutMs}ms`));
            });
            request.on('error', reject);
            request.end(body);
        });
    }

    private sign(value: Omit<SignedFleetCommandEnvelope, 'signature'>, sharedSecret: string): string {
        return createHmac('sha256', sharedSecret).update(this.stableStringify(value)).digest('hex');
    }

    private stableStringify(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
        }
        if (value !== null && typeof value === 'object') {
            const record = value as Record<string, unknown>;
            return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`).join(',')}}`;
        }
        const serialized = JSON.stringify(value);
        return serialized === undefined ? 'null' : serialized;
    }

}
