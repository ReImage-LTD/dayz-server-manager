import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AppCommonService } from '../../app-common/services/app-common.service';
import { PlayersService } from './players.service';

describe('PlayersService', () => {
    let playersService: PlayersService;

    const appCommon = {
        apiGET: jasmine.createSpy('apiGET').and.returnValue(of('[]')),
        apiPOST: jasmine.createSpy('apiPOST').and.returnValue(of('')),
        getApiFetcher: jasmine.createSpy('getApiFetcher').and.returnValue({
            data: of([]),
            latestData: of(null),
        }),
    };

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                PlayersService,
                { provide: AppCommonService, useValue: appCommon },
            ],
        });
        playersService = TestBed.inject(PlayersService);
    });

    describe('players$', () => {
        it('starts with an empty player list', () => {
            playersService.players$.subscribe(response => {
                expect(response).toEqual([]);
            });
        });
    });

    it('rejects malformed Steam IDs when converting identifiers', () => {
        expect(playersService.steam64ToBEGUID('invalid')).toBe('');
        expect(playersService.steam64ToDayZID('invalid')).toBe('');
    });
});
