// models/paquetes.model.ts
export interface PaqueteCuentaResumen {
    id: string;
    cuentaId: string;
    codigo: string;
    nombre: string;
    tipo: 'ingreso'|'impuestos'|'pago'|'costo'|'gasto'|'otro';      // 👈 nuevo
    naturaleza: 'debito'|'credito';                                 // 👈 nuevo
    orden: number | null;
  }
  
  export interface PaqueteResumen {
    id: string;
    nombre: string;
    descripcion: string;
    fechaCreacion: string;   // ISO
    cuentas: PaqueteCuentaResumen[];
  }
  
  // Si tu Empresa ya existe, solo agrega este campo:
  export interface Empresa {
    id: string;
    nombre: string;
    nit: string;
    codigo: string;
    centroOperacion: string;
    estado: 'activa' | 'vencida' | 'expirada' | string;
    contabilizaciones: any[]; // si ya lo usas
    paquetes?: PaqueteResumen[];  // <— NUEVO
  }
  