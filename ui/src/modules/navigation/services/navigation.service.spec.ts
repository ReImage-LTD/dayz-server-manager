import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Event, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
    let navigationService: NavigationService;
    let routerEvents: Subject<Event>;

    beforeEach(() => {
        routerEvents = new Subject<Event>();
        TestBed.configureTestingModule({
            providers: [
                NavigationService,
                { provide: ActivatedRoute, useValue: {} },
                { provide: Router, useValue: { events: routerEvents, url: '/dashboard' } },
            ],
        });
        navigationService = TestBed.inject(NavigationService);
    });

    describe('sideNavVisible$', () => {
        it('starts visible and reflects toggles', () => {
            const responses: boolean[] = [];
            navigationService.sideNavVisible$().subscribe(response => {
                responses.push(response);
            });

            navigationService.toggleSideNav();

            expect(responses).toEqual([true, false]);
        });
    });
});
