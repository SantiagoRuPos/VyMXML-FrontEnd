import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';

/* =========================
 * Tipos base (compatibles)
 * ========================= */
type Naturaleza = 'debito' | 'credito';

/** Tipos del modal/emitidos + nativos de recibidos */
type TipoLineaPUC =
  | 'ingreso' | 'impuestos' | 'pago' | 'costo' | 'gasto' | 'otro'   // del modal / emitidos
  | 'compra'  | 'impuesto'  | 'retefuente' | 'reteiva' | 'reteica' | 'total';   // recibidos

export interface PUCLinea {
  cuenta: string;
  tipo: TipoLineaPUC;        // puede llegar como "Ingreso", "Gasto", etc.
  naturaleza: Naturaleza;    // puede llegar como "Débito", "Crédito"
}

export interface ParsedDoc {
  id: string;
  filename: string;
  header: {
    fecha: string;
    proveedorNumeroId?: string;
  };
  items: Array<any>;
  totals: { subtotal: number; iva: number; total: number };
  /** Si la UI define/selecciona un "código impuesto" para IVA, se usa como override */
  impuestoCodigo?: string;
  raw: string;
}

export interface ExcelOptions {
  tipoComprobante?: number;
  filename?: string;
  sortByDate?: 'asc' | 'desc';
  autofillConsecutivo?: boolean;

  // Tarifas opcionales (si son 0, no genera esas filas)
  retefuenteTarifa?: number; // ej. 0.025 = 2.5% sobre subtotal
  reteivaPorc?: number;      // ej. 0.15  = 15% del IVA
  reteicaTarifa?: number;    // ej. 0.0033 = 3.3 x 1000 sobre subtotal
}

@Injectable({ providedIn: 'root' })
export class ContabilizacionRecibidosService {
  private readonly moneyFmt = '#,##0.00';

  /* -----------------------------
   * Utilidades de normalización
   * ----------------------------- */
  private norm(s: string | undefined | null): string {
    return (s ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private normalizeNaturaleza(nat: string | undefined | null): Naturaleza {
    const n = this.norm(nat);
    if (n.includes('deb')) return 'debito';
    if (n.includes('cred')) return 'credito';
    return 'debito';
  }

  /** Modal/emitidos → semántica de recibidos */
  private normalizeTipo(tipo: string | undefined | null):
    'compra' | 'gasto' | 'impuesto' | 'retefuente' | 'reteiva' | 'reteica' | 'total' {
    const t = this.norm(tipo);
    switch (t) {
      case 'ingreso':   return 'compra';
      case 'costo':     return 'compra';
      case 'impuestos': return 'impuesto';  // IVA descontable
      case 'pago':      return 'total';
      case 'gasto':     return 'gasto';
      case 'otro':      return 'gasto';
      case 'compra':
      case 'impuesto':
      case 'retefuente':
      case 'reteiva':
      case 'reteica':
      case 'total':     return t as any;
      default:          return 'gasto';
    }
  }

  /** Reglas por prefijo de cuenta (lo que usas en tu modal) */
  private refineTipoByCuenta(
    tipoBase: 'compra'|'gasto'|'impuesto'|'retefuente'|'reteiva'|'reteica'|'total',
    cuenta: string
  ) {
    const c = (cuenta || '').trim();
    if (/^(51|61)/.test(c)) return 'compra';   // 51xx/61xx → base (Débito)
    if (/^2408/.test(c))    return 'impuesto'; // IVA descontable (Débito)
    if (/^2365/.test(c))    return 'reteica';  // ICA (Crédito)  ← ajusta si tu PUC usa 2368 para ICA
    if (/^2367/.test(c))    return 'reteiva';  // ReteIVA (Crédito)
    if (/^2205/.test(c))    return 'total';    // Proveedores (Crédito)
    if (/^2480/.test(c))    return 'total';    // Proveedores (Crédito)
    return tipoBase;
  }

  /** Fuerza naturaleza correcta según tipo (ignora la del modal) */
  private enforceNaturaleza(
    tipo: 'compra'|'gasto'|'impuesto'|'retefuente'|'reteiva'|'reteica'|'total'
  ): Naturaleza {
    switch (tipo) {
      case 'compra':
      case 'gasto':
      case 'impuesto':   return 'debito';
      case 'retefuente':
      case 'reteiva':
      case 'reteica':
      case 'total':      return 'credito';
    }
  }

  /** Tipo → código SIIGO (columna "Código impuesto") */
  private codigoImpuestoPorTipo(
    tipo: 'compra'|'gasto'|'impuesto'|'retefuente'|'reteiva'|'reteica'|'total',
    overrideDoc?: string
  ): string {
    switch (tipo) {
      case 'impuesto':   return overrideDoc || '04'; // IVA descontable
      case 'retefuente': return '03';                // Retefuente
      case 'reteiva':    return '04';                // ReteIVA (ajústalo si usas otro)
      case 'reteica':    return '05';                // ICA
      default:           return '';                  // 51xx/61xx/2205/1105/1305 → vacío
    }
  }

  /* -----------------------------
   * API principal
   * ----------------------------- */
  /** Genera y descarga el Excel para RECIBIDOS */
  exportRecibidos(docs: ParsedDoc[], paquete: PUCLinea[], opts: ExcelOptions = {}): void {
    if (!docs?.length) throw new Error('No hay documentos recibidos para exportar.');
    if (!paquete?.length) throw new Error('No hay paquete PUC seleccionado.');

    const tipoComprobante = opts.tipoComprobante ?? 4; // fijo para recibidos
    const filename = opts.filename || `contabilizacion_recibidos_${new Date().toISOString().slice(0,10)}.xlsx`;

    const sortDir = opts.sortByDate ?? 'asc';
    const normalizedDocs = [...docs]
      .map(d => ({ ...d, __fechaYMD: this.toYMD(d.header.fecha) } as ParsedDoc & {__fechaYMD:string}))
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
      autofillConsecutivo: !!opts.autofillConsecutivo,
      retefuenteTarifa: opts.retefuenteTarifa ?? 0,
      reteivaPorc:      opts.reteivaPorc      ?? 0,
      reteicaTarifa:    opts.reteicaTarifa    ?? 0,
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    this.applyMoneyFormat(ws);

    // Anchos
    const widths = Array.from({ length: header.length }, () => ({ wch: 12 }));
    widths[0] = { wch: 18 };
    widths[1] = { wch: 14 };
    widths[2] = { wch: 16 };
    widths[5] = { wch: 20 };
    widths[6] = { wch: 18 };
    widths[21] = { wch: 14 };
    widths[22] = { wch: 14 };
    ws['!cols'] = widths;

    XLSX.utils.book_append_sheet(wb, ws, 'Recibidos');
    const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), filename);
  }

  /* -----------------------------
   * Construcción de filas
   * ----------------------------- */
  private buildRows(
    docs: (ParsedDoc & { __fechaYMD: string })[],
    paquete: PUCLinea[],
    cfg: {
      tipoComprobante: number;
      cols: number;
      autofillConsecutivo: boolean;
      retefuenteTarifa: number;
      reteivaPorc: number;
      reteicaTarifa: number;
    }
  ): any[] {
    const rows: any[] = [];
    let consecutivo = 1;

    for (const d of docs) {
      const fechaYMD = d.__fechaYMD;
      const tercero = d.header.proveedorNumeroId || '';
      const overrideImpuestoDoc = d.impuestoCodigo || '';

      // —— Cálculos por factura (una vez) ——
      const rfte = this.calcReteFuente(d, cfg.retefuenteTarifa);
      const riva = this.calcReteIVA(d, cfg.reteivaPorc);
      const ricaCalc = this.calcReteICA(d, cfg.reteicaTarifa);
      const rica = ricaCalc || this.inferReteICA(d);  // si no mandas tarifa y solo hay ICA
      const neto = Math.max(0, +(d.totals.total - (rfte + riva + rica)).toFixed(2));

      // Consecutivo único por factura
      const consecutivoActual = consecutivo;

      // Evitar duplicados: cada componente (base, iva, rfte, riva, rica, total) solo 1 vez
      const usado: Record<string, boolean> = {
        compra: false, impuesto: false, retefuente: false, reteiva: false, reteica: false, total: false
      };

      for (const lineaRaw of paquete) {
        const cuenta = (lineaRaw as any).cuenta;
        const tipoBase = this.normalizeTipo((lineaRaw as any).tipo);
        const tipoDetectado = this.refineTipoByCuenta(tipoBase, cuenta);

        // Normaliza la llave para base: trata 'gasto' como 'compra' (una única base)
        const key: keyof typeof usado =
          (tipoDetectado === 'gasto' ? 'compra' : tipoDetectado) as any;

        // Si ya usamos un componente de ese tipo, salta
        if ((key in usado) && usado[key]) continue;

        const naturaleza = this.enforceNaturaleza(tipoDetectado);
        const monto = this.getMontoPorTipo(tipoDetectado, d, { rfte, riva, rica, neto });
        if (!monto) continue; // no genera filas con 0

        const fila: any[] = new Array(cfg.cols).fill('');
        fila[0]  = cfg.tipoComprobante;
        if (cfg.autofillConsecutivo) fila[1] = consecutivoActual;
        fila[2]  = fechaYMD;
        fila[5]  = cuenta;
        fila[6]  = tercero;

        // Código impuesto SOLO en líneas de impuesto/retención (2408/236x)
        fila[16] = this.codigoImpuestoPorTipo(tipoDetectado, overrideImpuestoDoc);

        if (naturaleza === 'debito') { fila[21] = monto; fila[22] = 0; }
        else                        { fila[21] = 0;     fila[22] = monto; }

        rows.push(fila);
        if (key in usado) usado[key] = true;
      }

      if (cfg.autofillConsecutivo) consecutivo++;
    }

    return rows;
  }

  /** Montos por tipo (usa retenciones y neto precalculados) */
  private getMontoPorTipo(
    tipo: 'compra' | 'gasto' | 'impuesto' | 'retefuente' | 'reteiva' | 'reteica' | 'total',
    d: ParsedDoc,
    k: { rfte: number; riva: number; rica: number; neto: number }
  ): number {
    switch (tipo) {
      case 'compra':
      case 'gasto':     return d.totals.subtotal; // Débito (una sola vez)
      case 'impuesto':  return d.totals.iva;      // Débito (IVA 2408, si > 0)
      case 'retefuente':return k.rfte;            // Crédito
      case 'reteiva':   return k.riva;            // Crédito
      case 'reteica':   return k.rica;            // Crédito
      case 'total':     return k.neto;            // Crédito (2205/2480)
      default:          return 0;
    }
  }

  /* -----------------------------
   * Cálculos de retenciones
   * ----------------------------- */
  private calcReteFuente(d: ParsedDoc, tarifa: number): number {
    if (!d.totals.subtotal || !tarifa) return 0;
    return +(d.totals.subtotal * tarifa).toFixed(2);
  }

  private calcReteIVA(d: ParsedDoc, porc: number): number {
    if (!d.totals.iva || !porc) return 0;
    return +(d.totals.iva * porc).toFixed(2);
  }

  /** Si no hay tarifa de ICA, infiere solo si la diferencia es significativa
   *  delta = (subtotal + iva) - total  → si > 0.01, se toma como ICA; si no, 0. */
  private inferReteICA(d: ParsedDoc): number {
    const delta = +(((d.totals.subtotal || 0) + (d.totals.iva || 0) - (d.totals.total || 0)).toFixed(2));
    return delta > 0.01 ? delta : 0;
  }

  private calcReteICA(d: ParsedDoc, tarifa: number): number {
    if (!d.totals.subtotal || !tarifa) return 0;
    return +(d.totals.subtotal * tarifa).toFixed(2);
  }

  /* -----------------------------
   * Utilidades Excel y fechas
   * ----------------------------- */
  /** Aplica formato de moneda en V/W (Débito/Crédito) */
  private applyMoneyFormat(ws: XLSX.WorkSheet) {
    const ref = ws['!ref'] as string;
    const range = XLSX.utils.decode_range(ref);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const c of [21, 22]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && typeof cell.v === 'number') (cell as any).z = this.moneyFmt;
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
      return `${dt.getFullYear()}-${(dt.getMonth()+1).toString().padStart(2,'0')}-${dt.getDate().toString().padStart(2,'0')}`;
    }
    return '';
  }

  private dateValue(ymd: string): number {
    if (!ymd) return Number.MAX_SAFE_INTEGER;
    const [y, m, d] = ymd.split('-').map(n => parseInt(n, 10) || 0);
    return y * 10000 + m * 100 + d;
  }
}
