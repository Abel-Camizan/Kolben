import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from './core/auth';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(Auth);
}
