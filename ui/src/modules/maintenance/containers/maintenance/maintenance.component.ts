import { Component, OnInit } from '@angular/core';
import { TrackedOperation } from '../../../app-common/models';
import { BackupSummary, MaintenanceService } from '../../services/maintenance.service';

@Component({
    selector: 'sb-maintenance',
    templateUrl: './maintenance.component.html',
    styleUrls: ['maintenance.component.scss'],
})
export class MaintenanceComponent implements OnInit {

    public outcomeBadge?: {
        message: string;
        success: boolean;
    };
    public runningAction?: string;
    public backups: BackupSummary[] = [];
    public operations: TrackedOperation[] = [];
    public loadingHistory = false;

    public constructor(
        private maintenance: MaintenanceService,
    ) {}

    public ngOnInit(): void {
        void this.refreshHistory();
    }

    private exactBooleanParse(val?: string | boolean): boolean | undefined {
        if (val === true || val === 'true') {
            return true;
        } else if (val === false || val === 'false') {
            return false;
        } else {
            return undefined;
        }
    }

    private async runOperation(
        action: string,
        operation: () => Promise<boolean>,
        successMessage: string,
        failureMessage: string,
    ): Promise<void> {
        if (this.runningAction) return;

        this.runningAction = action;
        this.outcomeBadge = undefined;
        try {
            const success = await operation();
            this.outcomeBadge = {
                message: success ? successMessage : failureMessage,
                success,
            };
        } catch {
            this.outcomeBadge = {
                message: failureMessage,
                success: false,
            };
        } finally {
            this.runningAction = undefined;
            await this.refreshHistory();
        }
    }

    public async refreshHistory(): Promise<void> {
        if (this.loadingHistory) return;
        this.loadingHistory = true;
        try {
            [this.backups, this.operations] = await Promise.all([
                this.maintenance.getBackups(),
                this.maintenance.getOperations(),
            ]);
        } finally {
            this.loadingHistory = false;
        }
    }

    public operationLabel(type: string): string {
        return type.split('.').join(' ');
    }

    public async restoreBackup(backup: BackupSummary, restart: boolean): Promise<void> {
        const restartMessage = restart ? ' The server will be stopped and restarted.' : '';
        if (!confirm(`Restore backup from ${new Date(backup.mtime).toLocaleString()}?${restartMessage} Current mission files will be replaced.`)) {
            return;
        }
        await this.runOperation(
            `restore-${backup.id}`,
            () => this.maintenance.restoreBackup(backup.id, true, restart),
            'Backup restore queued. Follow its progress below.',
            'Failed to queue backup restore',
        );
    }

    public async updateServer(validate?: string | boolean): Promise<void> {
        await this.runOperation(
            'update-server',
            () => this.maintenance.updateServer(this.exactBooleanParse(validate)),
            'Successfully updated server',
            'Failed to update server',
        );
    }

    public async updateMods(validate?: string | boolean, force?: string | boolean): Promise<void> {
        await this.runOperation(
            'update-mods',
            () => this.maintenance.updateMods(this.exactBooleanParse(validate), this.exactBooleanParse(force)),
            'Successfully updated mods',
            'Failed to update mods',
        );
    }

    public async createBackup(): Promise<void> {
        await this.runOperation(
            'create-backup',
            () => this.maintenance.createBackup(),
            'Successfully created backup',
            'Failed to create backup',
        );
    }

    public async lockServer(): Promise<void> {
        await this.runOperation(
            'lock-server',
            () => this.maintenance.lockServer(),
            'Successfully locked the server',
            'Failed to lock the server',
        );
    }

    public async unlockServer(): Promise<void> {
        await this.runOperation(
            'unlock-server',
            () => this.maintenance.unlockServer(),
            'Successfully unlocked the server',
            'Failed to unlock the server',
        );
    }

    public async lockRestarts(): Promise<void> {
        await this.runOperation(
            'lock-restarts',
            () => this.maintenance.lockRestarts(),
            'Successfully locked server restarts',
            'Failed to lock server restarts',
        );
    }

    public async unlockRestarts(): Promise<void> {
        await this.runOperation(
            'unlock-restarts',
            () => this.maintenance.unlockRestarts(),
            'Successfully unlocked server restarts',
            'Failed to unlock server restarts',
        );
    }

    public async restartServer(force: boolean = false): Promise<void> {
        if (this.runningAction || (force && !confirm(
            'Force restart immediately? Active players may lose unsaved progress.',
        ))) return;

        await this.runOperation(
            force ? 'force-restart' : 'restart-server',
            () => this.maintenance.restartServer(force),
            force ? 'Force restart command sent' : 'Restart command sent',
            force ? 'Failed to force restart server' : 'Failed to restart server',
        );
    }

    public async kickAll(): Promise<void> {
        if (this.runningAction || !confirm('Kick every connected player from the server?')) return;

        await this.runOperation(
            'kick-all',
            () => this.maintenance.kickAll(),
            'Successfully kicked all players',
            'Failed to kick all players',
        );
    }

    public async shutdown(): Promise<void> {
        if (this.runningAction || !confirm('Shut down the DayZ server now?')) return;

        await this.runOperation(
            'shutdown',
            () => this.maintenance.shutdown(),
            'Successfully executed RCON shutdown',
            'Failed to execute RCON shutdown',
        );
    }

    public async sendMessage(msg: string): Promise<void> {
        if (!msg?.trim()) return;

        await this.runOperation(
            'send-message',
            () => this.maintenance.sendMessage(msg.trim()),
            'Successfully sent global message',
            'Failed to send global message',
        );
    }

}
