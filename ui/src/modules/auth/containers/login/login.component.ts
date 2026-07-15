import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'sb-login',
    templateUrl: './login.component.html',
    styleUrls: ['login.component.scss'],
})
export class LoginComponent implements OnInit {
    public username = '';
    public password = '';
    public remember = false;

    public failure = '';
    public isLoading = false;

    public constructor(private auth: AuthService, private router: Router) {}

    public ngOnInit(): void {
        // ignore
    }

    public async login(): Promise<void> {
        if (this.isLoading || !this.username || !this.password) {
            return;
        }

        this.failure = '';
        this.isLoading = true;

        try {
            await this.auth.login(this.username, this.password, this.remember);
            await this.router.navigate(['/dashboard']);
        } catch (e) {
            console.error('Login failed', e);
            this.failure = 'Unable to sign in. Check your username and password, then try again.';
        } finally {
            this.isLoading = false;
        }
    }
}
