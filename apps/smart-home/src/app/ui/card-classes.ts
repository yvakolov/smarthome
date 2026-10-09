import { ElementRef, inject } from '@angular/core';
/** The generated Card primitives use static classes only; preserve consumer classes. */
export function classes(value: () => string): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  element.classList.add(...value().split(/\s+/).filter(Boolean));
}
