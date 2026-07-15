import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthService } from '../../auth/services/auth.service';

import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { TrackedOperation } from '../../app-common/models';

export interface BackupSummary {
    id: string;
    file: string;
    mtime: number;
}


@Injectable({ providedIn: 'root' })
export class MaintenanceService {

    public constructor(
        private httpClient: HttpClient,
        private auth: AuthService,
    ) {
    }

    public execute(action: string, body?: any): Promise<boolean> {
        return firstValueFrom(this.httpClient.post(
            `/api/${action}`,
            body,
            {
                headers: this.auth.getAuthHeaders(),
                observe: 'response',
                responseType: 'text',
                withCredentials: true,
            },
        ).pipe(
            map((x: HttpResponse<any>) => {
                return !!x?.ok;
            }),
            catchError((e) => {console.log(e); return of(false)}),
        ));
    }

    public async updateServer(validate?: boolean): Promise<boolean> {
        return this.execute('updateserver', { validate });
    }

    public async updateMods(validate?: boolean, force?: boolean): Promise<boolean> {
        return this.execute('updatemods', { validate, force });
    }

    public async createBackup(): Promise<boolean> {
        return this.execute('createbackup');
    }

    public getBackups(): Promise<BackupSummary[]> {
        return firstValueFrom(this.httpClient.get<BackupSummary[]>(
            '/api/getbackups',
            {
                headers: this.auth.getAuthHeaders(),
                withCredentials: true,
            },
        ).pipe(
            catchError(() => of([])),
        ));
    }

    public getOperations(): Promise<TrackedOperation[]> {
        return firstValueFrom(this.httpClient.get<TrackedOperation[]>(
            '/api/operations',
            {
                headers: this.auth.getAuthHeaders(),
                params: { limit: '20' },
                withCredentials: true,
            },
        ).pipe(
            catchError(() => of([])),
        ));
    }

    public restoreBackup(id: string, createBackup: boolean, restart: boolean): Promise<boolean> {
        return this.execute('restorebackup', { id, createBackup, restart });
    }

    public async lockServer(): Promise<boolean> {
        return this.execute('lock');
    }

    public async unlockServer(): Promise<boolean> {
        return this.execute('unlock');
    }

    public async lockRestarts(): Promise<boolean> {
        return this.execute('lockrestart');
    }

    public async unlockRestarts(): Promise<boolean> {
        return this.execute('unlockrestart');
    }

    public async restartServer(force?: boolean): Promise<boolean> {
        return this.execute('restart', { force });
    }

    public async shutdown(): Promise<boolean> {
        return this.execute('shutdown');
    }

    public async kickAll(): Promise<boolean> {
        return this.execute('kickall');
    }

    public async sendMessage(message: string): Promise<boolean> {
        return this.execute('global', { message });
    }

}
