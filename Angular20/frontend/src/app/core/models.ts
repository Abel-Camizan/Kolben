export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  rol: 'administrador' | 'vendedor' | 'cliente';
}

// Repuesto tal como lo ve el cliente en el catálogo público
export interface ItemCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  precio: string;
  stock: number;
  marca: string | null;
  categoria: string | null;
  modelos: Modelo[];
}

export type EstadoPedido = 'pendiente' | 'confirmado' | 'entregado' | 'cancelado';

export interface ItemPedido {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
}

export interface Pedido {
  id: number;
  numero: string;
  estado: EstadoPedido;
  total: string;
  nota: string | null;
  venta_id: number | null;
  creado_en: string;
  cliente: string;
  cliente_telefono: string | null;
  cliente_documento: string | null;
  items?: ItemPedido[]; // solo viene en el detalle de un pedido
}

export interface Modelo {
  id: number;
  nombre: string;
}

export interface Repuesto {
  id: number;
  codigo: string;
  nombre: string;
  precio: string; // PostgreSQL entrega los decimales como texto: usar Number()
  stock: number;
  stock_minimo: number;
  activo: boolean;
  marca_id: number | null;
  marca: string | null;
  categoria_id: number | null;
  categoria: string | null;
  modelos: Modelo[];
}

// Lo que se envía al crear o editar un repuesto
export interface DatosRepuesto {
  codigo: string;
  nombre: string;
  marca_id: number | null;
  categoria_id: number | null;
  precio: number;
  stock: number;
  stock_minimo: number;
  modelos: number[];
}

export interface ItemComprobante {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  precio_unitario: string;
  subtotal: string;
}

export interface Comprobante {
  id: number;
  numero: string;
  fecha: string;
  total: string;
  vendedor: string;
  cliente: string | null;
  items: ItemComprobante[];
}

export interface Proveedor {
  id: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface ItemIngreso {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  cantidad: number;
  costo_unit: string;
  subtotal: string;
}

export interface Ingreso {
  id: number;
  fecha: string;
  observacion: string | null;
  proveedor_id: number;
  proveedor: string;
  registrado_por: string;
  total: string;
  items?: ItemIngreso[]; // solo viene en el detalle de un ingreso
}

// Usuario tal como lo ve el administrador en la gestión de cuentas
export interface UsuarioAdmin extends Usuario {
  activo: boolean;
  creado_en: string;
}

export interface FilaVentasPeriodo {
  periodo: string;
  ventas: number;
  total: string;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  agrupar: 'dia' | 'semana' | 'mes';
  filas: FilaVentasPeriodo[];
  resumen: { ventas: number; total: string };
}

export interface FilaStockModelo {
  modelo_id: number;
  modelo: string;
  repuesto_id: number;
  codigo: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  precio: string;
  bajo_minimo: boolean;
}

export interface FilaMasVendido {
  repuesto_id: number;
  codigo: string;
  nombre: string;
  unidades: number;
  ingresos: string;
}

export interface Cliente {
  id: number;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  creado_en: string;
}

export interface VentaCliente {
  id: number;
  numero: string;
  fecha: string;
  total: string;
  vendedor: string;
}

export interface ClienteDetalle extends Cliente {
  resumen: { compras: number; total: string; ultima: string | null };
  historial: VentaCliente[];
}
