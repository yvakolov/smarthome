import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
@Component({selector:'sh-auth-layout',imports:[RouterOutlet],template:'<main class="auth-layout"><router-outlet /></main>',changeDetection:ChangeDetectionStrategy.OnPush})
export class AuthLayout {}
