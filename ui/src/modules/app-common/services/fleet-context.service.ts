import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FleetNodeStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class FleetContextService {

    private readonly http: HttpClient;
    private readonly nodesSubject = new BehaviorSubject<FleetNodeStatus[]>([]);
    private readonly activeNodeSubject = new BehaviorSubject<FleetNodeStatus | undefined>(undefined);

    public constructor(handler: HttpBackend) {
        this.http = new HttpClient(handler);
        try {
            const cached = localStorage.getItem('DZSM_ACTIVE_NODE_DESCRIPTOR');
            if (cached) {
                this.activeNodeSubject.next(JSON.parse(cached) as FleetNodeStatus);
            }
        } catch (_) {
            localStorage.removeItem('DZSM_ACTIVE_NODE_DESCRIPTOR');
        }
    }

    public get nodes$(): Observable<FleetNodeStatus[]> {
        return this.nodesSubject.asObservable();
    }

    public get activeNode$(): Observable<FleetNodeStatus | undefined> {
        return this.activeNodeSubject.asObservable();
    }

    public get activeNode(): FleetNodeStatus | undefined {
        return this.activeNodeSubject.value;
    }

    public async load(headers: { [key: string]: string }): Promise<void> {
        const nodes = await this.http.get<FleetNodeStatus[]>(
            '/api/nodes',
            { headers, withCredentials: true },
        ).toPromise().catch(() => []);
        this.nodesSubject.next(nodes);
        const savedId = localStorage.getItem('DZSM_ACTIVE_NODE');
        this.select(nodes.some((node) => node.descriptor.id === savedId)
            ? savedId!
            : nodes.find((node) => node.descriptor.type === 'local')?.descriptor.id);
    }

    public select(nodeId?: string, reload: boolean = false): void {
        const previousId = this.activeNodeSubject.value?.descriptor.id;
        const selected = this.nodesSubject.value.find((node) => node.descriptor.id === nodeId)
            || this.nodesSubject.value.find((node) => node.descriptor.type === 'local');
        this.activeNodeSubject.next(selected);
        if (selected) {
            localStorage.setItem('DZSM_ACTIVE_NODE', selected.descriptor.id);
            localStorage.setItem('DZSM_ACTIVE_NODE_DESCRIPTOR', JSON.stringify(selected));
            if (reload && previousId && previousId !== selected.descriptor.id) {
                window.location.reload();
            }
        }
    }

}
