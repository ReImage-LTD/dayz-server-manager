import {
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpParams,
    HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FleetContextService } from './fleet-context.service';

@Injectable()
export class FleetInterceptor implements HttpInterceptor {

    public constructor(private fleet: FleetContextService) {}

    public intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        const node = this.fleet.activeNode;
        const match = request.url.match(/^\/api\/([^/?]+)/);
        if (!node || node.descriptor.type === 'local' || !match
            || ['login', 'nodes', 'fleetdispatch'].includes(match[1])) {
            return next.handle(request);
        }

        const query: Record<string, string | string[]> = {};
        request.params.keys().forEach((key) => {
            const values = request.params.getAll(key) || [];
            query[key] = values.length > 1 ? values : values[0];
        });
        const fleetRequest = request.clone({
            url: '/api/fleetdispatch',
            method: 'POST',
            body: {
                nodeId: node.descriptor.id,
                resource: match[1],
                body: request.body,
                query,
            },
            params: new HttpParams(),
        });
        return next.handle(fleetRequest);
    }

}
