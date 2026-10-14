import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

// Íconos de trazo (24×24) dibujados a mano; no dependen de ninguna librería externa.
const FORMAS: Record<string, string> = {
  logo: '<rect x="7" y="3.5" width="10" height="9.5" rx="1.8"/><path d="M7 7.5h10M12 13v7M9 20.5h6"/>',
  ventas:
    '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h3l2.6 11.9a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20.5 8H6.2"/>',
  pedidos:
    '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5h6V7H9zM9 12h6M9 16h4"/>',
  clientes:
    '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  repuestos: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  proveedores:
    '<rect x="2" y="6" width="12" height="10" rx="1"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  ingresos: '<path d="M12 3v11M8 10l4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  reportes: '<path d="M5 21V11M12 21V4M19 21v-8"/>',
  usuarios: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/>',
  catalogo:
    '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  usuario: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  salir: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  buscar: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  alerta: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.5v.01"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  imprimir: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  tuerca:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
};

@Component({
  selector: 'app-icono',
  template: '<span class="icono" [innerHTML]="svg()"></span>',
  styles: ':host { display: inline-flex; line-height: 0; } .icono { display: inline-flex; }',
})
export class Icono {
  private readonly sanitizer = inject(DomSanitizer);

  readonly nombre = input.required<string>();
  readonly tamano = input(18);

  // Las formas son constantes de este archivo (nunca vienen del usuario), por eso se marcan como seguras
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      `<svg width="${this.tamano()}" height="${this.tamano()}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
        `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FORMAS[this.nombre()] ?? ''}</svg>`,
    ),
  );
}
