import { Directive } from '@angular/core';
import { classes } from '../../card-classes';

@Directive({
	selector: '[hlmCardDescription]',
	host: { 'data-slot': 'card-description' },
})
export class HlmCardDescription {
	constructor() {
		classes(() => 'spartan-card-description');
	}
}
