import { Directive } from '@angular/core';
import { classes } from '../../card-classes';

@Directive({
	selector: '[hlmCardTitle]',
	host: { 'data-slot': 'card-title' },
})
export class HlmCardTitle {
	constructor() {
		classes(() => 'spartan-card-title');
	}
}
