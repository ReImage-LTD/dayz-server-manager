import { Manager } from '../control/manager';
import { LogLevel } from '../util/logger';
import * as path from 'path';
import { Paths } from '../services/paths';
import { FileDescriptor } from '../types/log-reader';
import { IService } from '../types/service';
import { LoggerFactory } from './loggerfactory';
import { FSAPI, InjectionTokens } from '../util/apis';
import { inject, injectable, singleton } from 'tsyringe';
import { randomBytes } from 'crypto';

export interface BackupDescriptor extends FileDescriptor {
    id: string;
}

@singleton()
@injectable()
export class Backups extends IService {

    public constructor(
        loggerFactory: LoggerFactory,
        private manager: Manager,
        private paths: Paths,
        @inject(InjectionTokens.fs) private fs: FSAPI,
    ) {
        super(loggerFactory.createLogger('Backups'));
    }

    public async createBackup(): Promise<BackupDescriptor | undefined> {
        const backups = this.getBackupDir();

        await this.fs.promises.mkdir(backups, { recursive: true });

        const mpmissions = path.join(this.manager.getServerPath(), 'mpmissions');
        if (!this.fs.existsSync(mpmissions)) {
            this.log.log(LogLevel.WARN, 'Skipping backup because mpmissions folder does not exist');
            return;
        }

        const curMarker = `mpmissions_${randomBytes(16).toString('hex')}`;

        this.log.log(LogLevel.IMPORTANT, `Creating backup ${curMarker}`);

        const curBackup = path.join(backups, curMarker);
        const staging = path.join(backups, `.creating-${curMarker}`);
        if (!await this.paths.copyDirFromTo(mpmissions, staging)) {
            throw new Error('Could not copy mission files into backup staging directory');
        }
        try {
            await this.fs.promises.rename(staging, curBackup);
        } catch (error) {
            await this.fs.promises.rm(staging, { recursive: true, force: true });
            throw error;
        }

        const stats = await this.fs.promises.stat(curBackup);
        const descriptor = {
            id: curMarker,
            file: curMarker,
            mtime: stats.mtime.getTime(),
        };
        void this.cleanup();
        return descriptor;
    }

    private getBackupDir(): string {
        if (this.paths.isAbsolute(this.manager.config.backupPath)) {
            return this.manager.config.backupPath;
        }
        return path.join(this.paths.cwd(), this.manager.config.backupPath);
    }

    public async getBackups(): Promise<BackupDescriptor[]> {
        const backups = this.getBackupDir();
        if (!this.fs.existsSync(backups)) {
            return [];
        }
        const files = await this.fs.promises.readdir(backups);
        const foundBackups: BackupDescriptor[] = [];
        for (const file of files) {
            const fullPath = path.join(backups, file);
            const stats = await this.fs.promises.lstat(fullPath);
            if (this.isBackupId(file) && stats.isDirectory() && !stats.isSymbolicLink()) {
                foundBackups.push({
                    id: file,
                    file,
                    mtime: stats.mtime.getTime(),
                });
            }
        }
        return foundBackups.sort((a, b) => b.mtime - a.mtime);
    }

    public async restoreBackup(id: string): Promise<void> {
        if (!this.isBackupId(id)) {
            throw new Error('Invalid backup id');
        }

        const backup = path.join(this.getBackupDir(), id);
        if (!this.fs.existsSync(backup)) {
            throw new Error('Backup does not exist');
        }
        const backupStats = await this.fs.promises.lstat(backup);
        if (!backupStats.isDirectory() || backupStats.isSymbolicLink()) {
            throw new Error('Backup is not a local directory');
        }

        const destination = path.join(this.manager.getServerPath(), 'mpmissions');
        const staging = path.join(this.manager.getServerPath(), `.mpmissions-restore-${randomBytes(6).toString('hex')}`);
        const rollback = path.join(this.manager.getServerPath(), `.mpmissions-rollback-${randomBytes(6).toString('hex')}`);
        if (!await this.paths.copyDirFromTo(backup, staging)) {
            throw new Error('Could not stage backup restore');
        }

        let movedCurrent = false;
        try {
            if (this.fs.existsSync(destination)) {
                await this.fs.promises.rename(destination, rollback);
                movedCurrent = true;
            }
            await this.fs.promises.rename(staging, destination);
            if (movedCurrent) {
                try {
                    await this.fs.promises.rm(rollback, { recursive: true, force: true });
                } catch (error) {
                    this.log.log(LogLevel.WARN, 'Could not remove mission restore rollback directory', error);
                }
            }
        } catch (error) {
            await this.fs.promises.rm(staging, { recursive: true, force: true });
            if (movedCurrent && !this.fs.existsSync(destination)) {
                await this.fs.promises.rename(rollback, destination);
            }
            throw error;
        }
    }

    public async cleanup(): Promise<void> {
        const now = new Date().valueOf();
        const backups = await this.getBackups();
        for (const backup of backups) {
            if ((now - backup.mtime) > (this.manager.config.backupMaxAge * 24 * 60 * 60 * 1000)) {
                await this.paths.removeLink(path.join(this.getBackupDir(), backup.id));
            }
        }
    }

    private isBackupId(id: string): boolean {
        return /^mpmissions_[A-Za-z0-9_-]+$/.test(id);
    }

}
