import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `<button type="button" (click)="count.set(count() + 1)">
      fixture-count {{ count() }}
    </button>
    <img src="logo.svg" alt="" />`,
  styles: `
    button {
      color: rebeccapurple;
      background-image: url('./dot.png');
    }
  `,
})
export class App {
  // The text is here to check that the inlined code cannot close its own script element
  readonly marker = 'fixture-marker </script> end';
  readonly count = signal(0);
}
