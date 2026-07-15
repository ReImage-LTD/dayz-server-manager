import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { AuthGuard } from './auth.guard';

describe('Auth Guards', () => {
    let authGuard: AuthGuard;
    let auth: jasmine.SpyObj<AuthService>;
    let router: jasmine.SpyObj<Router>;

    beforeEach(() => {
        auth = jasmine.createSpyObj<AuthService>('AuthService', ['getAuth']);
        router = jasmine.createSpyObj<Router>('Router', ['navigate']);
        authGuard = new AuthGuard(auth, router);
    });

    describe('canActivate', () => {
        it('allows authenticated users', () => {
            auth.getAuth.and.returnValue('Basic credentials');

            expect(authGuard.canActivate()).toBe(true);
            expect(router.navigate).not.toHaveBeenCalled();
        });

        it('redirects unauthenticated users to login', () => {
            auth.getAuth.and.returnValue(null);

            expect(authGuard.canActivate()).toBe(false);
            expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
        });
    });
});
