import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthModule } from '../modules/auth/auth.module';
import { FleetInterceptor } from '../modules/app-common/services/fleet.interceptor';

@NgModule({
    declarations: [AppComponent],
    imports: [BrowserModule, AppRoutingModule, HttpClientModule, AuthModule],
    providers: [
        {
            provide: HTTP_INTERCEPTORS,
            useClass: FleetInterceptor,
            multi: true,
        },
    ],
    bootstrap: [AppComponent],
    exports: [],
})
export class AppModule {}
