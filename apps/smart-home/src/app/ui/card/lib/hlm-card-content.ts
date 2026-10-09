import { Directive } from '@angular/core';
import { classes } from '../../card-classes';

@Directive({
	selector: '[hlmCardContent]',
	host: { 'data-slot': 'card-content' },
})
export class HlmCardContent {
	constructor() {
		classes(() => 'spartan-card-content');
	}
}
