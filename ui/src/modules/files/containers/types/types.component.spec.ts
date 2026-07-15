import { of, throwError } from 'rxjs';

import { AppCommonService } from '../../../app-common/services/app-common.service';
import { MaintenanceService } from '../../../maintenance/services/maintenance.service';
import { TypesComponent } from './types.component';

class TestTypesComponent extends TypesComponent {
    public resolveFile(file: string): Promise<string> {
        return this.resolveMissionFile(file);
    }
}

describe('TypesComponent', () => {
    let appCommon: jasmine.SpyObj<AppCommonService>;
    let component: TestTypesComponent;

    beforeEach(() => {
        appCommon = jasmine.createSpyObj<AppCommonService>('AppCommonService', ['fetchMissionDir']);
        component = new TestTypesComponent(
            appCommon,
            jasmine.createSpyObj<MaintenanceService>('MaintenanceService', []),
        );
    });

    it('resolves a root mission filename case-insensitively', async () => {
        appCommon.fetchMissionDir.and.returnValue(of(['cfgspawnabletypes.xml', 'cfgeconomycore.xml']));

        await expectAsync(component.resolveFile('cfgEconomyCore.xml'))
            .toBeResolvedTo('cfgeconomycore.xml');
        expect(appCommon.fetchMissionDir).toHaveBeenCalledWith('/');
    });

    it('preserves the parent path when resolving a nested filename', async () => {
        appCommon.fetchMissionDir.and.returnValue(of(['Types.xml']));

        await expectAsync(component.resolveFile('db/types.xml')).toBeResolvedTo('db/Types.xml');
        expect(appCommon.fetchMissionDir).toHaveBeenCalledWith('db');
    });

    it('keeps the requested filename when directory listing is unavailable', async () => {
        appCommon.fetchMissionDir.and.returnValue(throwError(() => new Error('missing directory')));

        await expectAsync(component.resolveFile('optional.xml')).toBeResolvedTo('optional.xml');
    });
});
