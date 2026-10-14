import { Component, input } from '@angular/core';
import { Pedido } from '../core/models';

// Tabla con las líneas de un pedido; la usan el cliente y el personal
@Component({
  selector: 'app-pedido-detalle',
  template: `
    @if (pedido().items; as items) {
      <table>
        <thead>
          <tr><th>Código</th><th>Repuesto</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th></tr>
        </thead>
        <tbody>
          @for (i of items; track i.repuesto_id) {
            <tr>
              <td>{{ i.codigo }}</td>
              <td>{{ i.nombre }}</td>
              <td>{{ i.cantidad }}</td>
              <td>S/ {{ i.precio_unitario }}</td>
              <td>S/ {{ i.subtotal }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr><th colspan="4">Total</th><th>S/ {{ pedido().total }}</th></tr>
        </tfoot>
      </table>
      @if (pedido().nota) {
        <p><strong>Nota del cliente:</strong> {{ pedido().nota }}</p>
      }
    }
  `,
})
export class PedidoDetalle {
  readonly pedido = input.required<Pedido>();
}
