import { Directive } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { BrnInput } from '@spartan-ng/brain/input';
import { BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
// Application-owned helm styles over Spartan's maintained accessible primitives.
@Directive({selector:'button[hlmBtn],a[hlmBtn]',hostDirectives:[{directive:BrnButton,inputs:['disabled']}],host:{'data-slot':'button',class:'inline-flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-35'}})
export class HlmButton {}
@Directive({selector:'input[hlmInput]',hostDirectives:[{directive:BrnInput,inputs:['id','forceInvalid']},BrnFieldControlDescribedBy],host:{'data-slot':'input',class:'outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:opacity-40'}})
export class HlmInput {}
