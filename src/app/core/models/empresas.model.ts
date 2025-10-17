export interface Empresa {
    id: string;
    nombre: string;
    nit?: string;
    codigo?: string;
    estado?: string;
    fechaCreacion?: string;
    contabilizaciones?: Array<{
      id: string;
      nombre: string;
      descripcion?: string | null;
      cuentas?: Array<{ id: string; codigo: string; nombre: string }>;
    }>;
  }
  