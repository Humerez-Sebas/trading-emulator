import { Component } from '@angular/core';
import { R2MarketsComponent } from './r2-markets.component';

/**
 * Markets page: a thin wrapper around the R2 data hub (see
 * {@link R2MarketsComponent}), which owns its own data flow.
 */
@Component({
  selector: 'app-mercados-page',
  standalone: true,
  imports: [R2MarketsComponent],
  templateUrl: './mercados-page.component.html',
  styleUrl: './mercados-page.component.css',
})
export class MercadosPageComponent {}
