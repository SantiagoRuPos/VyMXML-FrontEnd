// Tipos base reutilizables
export type Naturaleza = 'debito' | 'credito';
export type TipoLineaPUC = 'ingreso' | 'impuestos' | 'pago' | 'costo' | 'gasto' | 'otro';

// Cuenta del diccionario PUC
export interface PUCAccount {
  id: string;             // uuid
  codigo: string;         // 41350101
  nombre: string;         // "Ingresos por ventas"
  tipo: TipoLineaPUC;     // bucket
  naturaleza: Naturaleza; // débito / crédito
  tercero: string;        // 'Documento' o un NIT específico
  activo: boolean;
  notas?: string;
  creadoEn: string;       // ISO
  actualizadoEn: string;  // ISO
}
