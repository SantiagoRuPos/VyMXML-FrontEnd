import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

/* === Tipos base === */
export type Naturaleza = 'debito' | 'credito';
export type TipoLineaPUC = 'ingreso' | 'impuestos' | 'pago' | 'costo' | 'gasto' | 'otro';

export interface PUCLinea {
  cuenta: string;
  tipo: TipoLineaPUC;
  naturaleza: Naturaleza;
}

export interface ParsedDoc {
  id: string;
  filename: string;
  header: {
    fecha: string;
    clienteNumeroId?: string;
  };
  items: Array<any>;
  totals: { subtotal: number; iva: number; total: number };
  raw: string;
}

export interface ExcelOptions {
  tipoComprobante?: number;
  filename?: string;
  /** 'asc' o 'desc' (por defecto 'asc') */
  sortByDate?: 'asc' | 'desc';
  /** Si true, llena la columna B (Consecutivo) 1..N según el orden final */
  autofillConsecutivo?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ContabilizacionExcelService {
  private readonly moneyFmt = '#,##0.00';

  /** Genera y descarga el Excel */
  exportContabilizacion(docs: ParsedDoc[], paquete: PUCLinea[], opts: ExcelOptions = {}): void {
    if (!docs?.length) throw new Error('No hay documentos para exportar.');
    if (!paquete?.length) throw new Error('No hay paquete PUC seleccionado.');

    const tipoComprobante = opts.tipoComprobante ?? 3;
    const filename = opts.filename || `contabilizacion_${new Date().toISOString().slice(0,10)}.xlsx`;

    // Ordenar por fecha
    const sortDir = opts.sortByDate ?? 'asc';
    const normalizedDocs = [...docs]
      .map(d => ({ ...d, __fechaYMD: this.toYMD(d.header.fecha) }))
      .sort((a, b) => {
        const va = this.dateValue(a.__fechaYMD);
        const vb = this.dateValue(b.__fechaYMD);
        return sortDir === 'asc' ? va - vb : vb - va;
      });

    const header = [
      'Tipo de comprobante', 'Consecutivo', 'Fecha de elaboración', 'Sigla moneda', 'Tasa de cambio',
      'Código cuenta contable', 'Identificación tercero', 'Sucursal', 'Código producto', 'Código de bodega',
      'Acción', 'Cantidad producto', 'Prefijo', 'Consecutivo', 'No. cuota', 'Fecha vencimiento',
      'Código impuesto', 'Código grupo activo fijo', 'Código activo fijo', 'Descripción',
      'Código centro/subcentro de costos', 'Débito', 'Crédito', 'Observaciones',
      'Base gravable libro compras/ventas', 'Base exenta libro compras/ventas', 'Mes de cierre'
    ];

    const rows = this.buildRows(normalizedDocs, paquete, {
      tipoComprobante,
      cols: header.length,
      autofillConsecutivo: !!opts.autofillConsecutivo
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);

    // aplicar formato de moneda en V/W
    this.applyMoneyFormat(ws);

    // Definir anchos de columnas
    const widths = Array.from({ length: header.length }, () => ({ wch: 12 }));
    widths[0]  = { wch: 18 };
    widths[1]  = { wch: 14 };
    widths[2]  = { wch: 16 };
    widths[5]  = { wch: 20 };
    widths[6]  = { wch: 18 };
    widths[21] = { wch: 14 };
    widths[22] = { wch: 14 };
    ws['!cols'] = widths;

    XLSX.utils.book_append_sheet(wb, ws, 'Contabilización');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), filename);
  }

  private buildRows(
    docs: (ParsedDoc & { __fechaYMD?: string })[],
    paquete: PUCLinea[],
    cfg: { tipoComprobante: number; cols: number; autofillConsecutivo: boolean }
  ): any[] {
    const rows: any[] = [];
    let consecutivo = 1;

    for (const d of docs) {
      const fechaYMD = d.__fechaYMD ?? this.toYMD(d.header.fecha);
      const tercero = d.header.clienteNumeroId || '';

      for (const linea of paquete) {
        const monto = this.getMontoPorTipo(linea.tipo, d);
        if (!monto) continue;

        const fila: any[] = new Array(cfg.cols).fill('');

        fila[0] = cfg.tipoComprobante;
        if (cfg.autofillConsecutivo) {
          fila[1] = consecutivo++;
        }
        fila[2] = fechaYMD;
        fila[5] = linea.cuenta;
        fila[6] = tercero;

        if (linea.naturaleza === 'debito') {
          fila[21] = monto;
          fila[22] = 0;
        } else {
          fila[21] = 0;
          fila[22] = monto;
        }

        rows.push(fila);
      }
    }
    return rows;
  }

  private getMontoPorTipo(tipo: TipoLineaPUC, d: ParsedDoc): number {
    switch (tipo) {
      case 'ingreso':    return d.totals.subtotal;
      case 'impuestos':  return d.totals.iva;
      case 'pago':       return d.totals.total;
      case 'costo':      return d.totals.subtotal;
      case 'gasto':      return d.totals.subtotal;
      default:           return 0;
    }
  }

  /** Aplica solo formato de moneda en V/W sin colores */
  private applyMoneyFormat(ws: XLSX.WorkSheet) {
    const ref = ws['!ref'] as string;
    const range = XLSX.utils.decode_range(ref);

    for (let r = range.s.r + 1; r <= range.e.r; r++) { // desde la fila 2 (omitimos header)
      for (const c of [21, 22]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') {
          (cell as any).z = this.moneyFmt;
        }
      }
    }
  }

  private toYMD(input: string | undefined | null): string {
    if (!input) return '';
    const s = String(input).trim();
    const mISO = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (mISO) {
      const y = +mISO[1], M = +mISO[2], d = +mISO[3];
      return `${y}-${M.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    }
    const mLatam = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (mLatam) {
      const d = +mLatam[1], M = +mLatam[2], y = +mLatam[3];
      return `${y}-${M.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    }
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const dt = new Date(t);
      const y = dt.getFullYear(), M = dt.getMonth()+1, d = dt.getDate();
      return `${y}-${M.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    }
    return '';
  }

  private dateValue(ymd: string): number {
    if (!ymd) return Number.MAX_SAFE_INTEGER;
    const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10) || 0);
    return y * 10000 + m * 100 + d;
  }
}
