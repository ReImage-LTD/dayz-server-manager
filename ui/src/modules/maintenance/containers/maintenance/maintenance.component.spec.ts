import { MaintenanceService } from '../../services/maintenance.service';
import { MaintenanceComponent } from './maintenance.component';

describe('MaintenanceComponent', () => {
    let component: MaintenanceComponent;
    let maintenance: jasmine.SpyObj<MaintenanceService>;

    beforeEach(() => {
        maintenance = jasmine.createSpyObj<MaintenanceService>('MaintenanceService', [
            'updateServer',
            'updateMods',
            'createBackup',
            'lockServer',
            'unlockServer',
            'lockRestarts',
            'unlockRestarts',
            'restartServer',
            'kickAll',
            'shutdown',
            'sendMessage',
        ]);
        component = new MaintenanceComponent(maintenance);
    });

    it('forwards update options as booleans', async () => {
        maintenance.updateMods.and.returnValue(Promise.resolve(true));

        await component.updateMods(true, false);

        expect(maintenance.updateMods).toHaveBeenCalledWith(true, false);
        expect(component.outcomeBadge).toEqual({
            message: 'Successfully updated mods',
            success: true,
        });
    });

    it('exposes an in-flight state until an operation completes', async () => {
        let resolveOperation!: (success: boolean) => void;
        maintenance.createBackup.and.returnValue(new Promise<boolean>((resolve) => {
            resolveOperation = resolve;
        }));

        const operation = component.createBackup();
        expect(component.runningAction).toBe('create-backup');

        resolveOperation(true);
        await operation;
        expect(component.runningAction).toBeUndefined();
    });

    it('does not force restart when confirmation is declined', async () => {
        spyOn(window, 'confirm').and.returnValue(false);

        await component.restartServer(true);

        expect(maintenance.restartServer).not.toHaveBeenCalled();
    });

    it('confirms kick-all and shutdown commands', async () => {
        const confirmation = spyOn(window, 'confirm').and.returnValue(false);

        await component.kickAll();
        await component.shutdown();

        expect(confirmation).toHaveBeenCalledTimes(2);
        expect(maintenance.kickAll).not.toHaveBeenCalled();
        expect(maintenance.shutdown).not.toHaveBeenCalled();
    });
});
