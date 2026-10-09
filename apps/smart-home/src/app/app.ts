import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
@Component({selector:'sh-root',imports:[RouterOutlet],template:'<router-outlet />',changeDetection:ChangeDetectionStrategy.OnPush})
export class App {}
