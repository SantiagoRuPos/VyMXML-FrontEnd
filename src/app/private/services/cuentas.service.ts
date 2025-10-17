import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, lastValueFrom, Observable, of, tap } from 'rxjs';
import { PUCAccount } from '../cuentas/puc.models';
import { PaqueteResumen } from '../../core/models/paquetes.model';

const STORAGE_KEY = 'puc_diccionario_v1';
export interface CreatePaqueteBody {
  empresaId: string;
  nombre: string;
  descripcion?: string;
  cuentas?: { cuentaId: string; orden?: number }[];
}

export interface ReplaceCuentasBody {
  cuentas: { cuentaId: string; orden?: number }[];
}
/* ================== Tipos ================== */
export type TipoPUC = 'ingreso' | 'impuestos' | 'pago' | 'costo' | 'gasto' | 'otro';
export type Naturaleza = 'debito' | 'credito';

export interface ImportOpts {
  dryRun?: boolean;              
  upsert?: boolean;                
  estadoCodigoDefault?: string;   
}


export interface EstadoRef {
  id: string;
  codigo: string;
  nombre?: string;
}

export interface CuentaPucApi {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoPUC;
  naturaleza: Naturaleza;
  nota?: string | null;
  estado: EstadoRef;
  fechaCreacion: string; 
}

export interface PageResponseApi<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}

export interface CreateCuentaPucDto {
  codigo: string;
  nombre: string;
  tipo: TipoPUC;
  naturaleza: Naturaleza;
  nota?: string;
  estadoCodigo?: string;
  estadoId?: string;
}

export interface ListQuery {
  q?: string;
  tipo?: TipoPUC;
  naturaleza?: Naturaleza;
  estado?: string;   // código estado
  page?: number;
  pageSize?: number;
}

export interface ErrorFila {
  fila: number;
  codigo: string;
  errores: string[];
}

export interface ReporteMasivo {
  total: number;
  validas: number;      // <- requerido
  invalidas: number;    // <- requerido
  inserted?: number;
  updated?: number;
  insertedOrUpdated?: number;
  errores: { fila: number; codigo: string; errores: string[] }[];
}



@Injectable({ providedIn: 'root' })
export class CuentasService {
  constructor(private http: HttpClient) {}

  private readonly apiBase = 'http://localhost:6824';





  importar(archivoMasivo: File, opts: ImportOpts = {}): Observable<ReporteMasivo> {
    const fd = new FormData();
    fd.append('file', archivoMasivo);
  
    // normaliza booleans a string para Nest
    if (opts.dryRun !== undefined)  fd.append('dryRun', String(!!opts.dryRun));
    if (opts.upsert !== undefined)  fd.append('upsert', String(!!opts.upsert));
  
    // por defecto usa 'activo'
    const estadoDef = (opts.estadoCodigoDefault ?? 'activo').trim();
    fd.append('estadoCodigoDefault', estadoDef);
  
    // Ruta que pediste
    return this.http.post<ReporteMasivo>(
      `${this.apiBase}/cuentas/importar-cuentas`,
      fd
    );
  }
  

  private delay(ms = 300) { return new Promise(r => setTimeout(r, ms)); }

  private read(): PUCAccount[] {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PUCAccount[] : [];
  }

  private write(list: PUCAccount[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  /** Lista local con filtros básicos */
  async list(params?: {
    search?: string;
    tipo?: string | 'todos';
    naturaleza?: string | 'todas';
    soloActivos?: boolean;
  }): Promise<PUCAccount[]> {
    try {
      // construye query params para el backend
      let qp = new HttpParams();
      if (params?.search?.trim())      qp = qp.set('q', params.search.trim());
      if (params?.tipo && params.tipo !== 'todos')           qp = qp.set('tipo', params.tipo);
      if (params?.naturaleza && params.naturaleza !== 'todas') qp = qp.set('naturaleza', params.naturaleza);
      if (params?.soloActivos)         qp = qp.set('estado', 'activo');
  
      const url = `${this.apiBase}/cuentas/listar-cuentas`;
  
      // la API responde: { page, pageSize, total, items: [...] }
      const resp: any = await lastValueFrom(this.http.get(url, { params: qp }));
  
      // mapea items del backend -> modelo del front
      const items = (resp?.items ?? []).map((it: any) => ({
        id: it.id,
        codigo: it.codigo,
        nombre: it.nombre,
        tipo: it.tipo,                 // 'ingreso' | 'impuestos' | ...
        naturaleza: it.naturaleza,     // 'debito' | 'credito'
        tercero: 'Documento',          // el backend general no trae tercero; default
        activo: it?.estado?.codigo === 'activo',
        creadoEn: it.fechaCreacion ?? new Date().toISOString(),
        actualizadoEn: it.fechaCreacion ?? new Date().toISOString(),
      })) as PUCAccount[];
  
      // si además quieres ordenar por código como antes:
      items.sort((a, b) => a.codigo.localeCompare(b.codigo));
      return items;
  
    } catch {
      // Fallback local (tu lógica anterior)
      await this.delay();
      let data = this.read();
  
      if (params?.soloActivos) data = data.filter(x => x.activo);
      if (params?.tipo && params.tipo !== 'todos') data = data.filter(x => x.tipo === params.tipo);
      if (params?.naturaleza && params.naturaleza !== 'todas') data = data.filter(x => x.naturaleza === params.naturaleza);
      if (params?.search?.trim()) {
        const q = params.search.trim().toLowerCase();
        data = data.filter(x =>
          x.codigo.toLowerCase().includes(q) ||
          x.nombre.toLowerCase().includes(q) ||
          x.tercero.toLowerCase().includes(q)
        );
      }
      data.sort((a, b) => a.codigo.localeCompare(b.codigo));
      return data;
    }
  }



async create(input: Omit<PUCAccount, 'id' | 'creadoEn' | 'actualizadoEn'>): Promise<PUCAccount> {

  try {
    const url = this.apiBase + '/cuentas/crear-cuenta'; 
    const dto = {
      codigo: input.codigo.trim(),
      nombre: input.nombre.trim(),
      tipo: (input.tipo || '').toLowerCase(),           
      naturaleza: (input.naturaleza || '').toLowerCase(), 
      estadoCodigo: input.activo ? 'activo' : 'inactivo',
    };

    const res: any = await lastValueFrom(this.http.post(url, dto));

    const now = new Date().toISOString();
    const acc: PUCAccount = {
      id: res.id ?? crypto.randomUUID(),
      codigo: res.codigo ?? input.codigo,
      nombre: res.nombre ?? input.nombre,
      tipo: res.tipo ?? input.tipo,
      naturaleza: res.naturaleza ?? input.naturaleza,
      tercero: input.tercero ?? 'Documento',
      activo: res?.estado?.codigo ? res.estado.codigo !== 'inactiva' : !!input.activo,
      creadoEn: res.fechaCreacion ?? now,
      actualizadoEn: now,
    };

    const list = this.read();
    const idx = list.findIndex(x => x.codigo === acc.codigo);
    if (idx >= 0) list[idx] = acc; else list.push(acc);
    this.write(list);

    return acc;
  } catch {
    await this.delay();
    const list = this.read();
    if (list.some(x => x.codigo === input.codigo)) {
      throw new Error('Ya existe una cuenta con ese código.');
    }
    const now = new Date().toISOString();
    const acc: PUCAccount = {
      ...input,
      id: crypto.randomUUID(),
      creadoEn: now,
      actualizadoEn: now,
    };
    list.push(acc);
    this.write(list);
    return acc;
  }
}


  async update(id: string, patch: Partial<PUCAccount>): Promise<PUCAccount> {
    await this.delay();
    const list = this.read();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) throw new Error('Cuenta no encontrada.');

    if (patch.codigo && patch.codigo !== list[idx].codigo) {
      if (list.some(x => x.codigo === patch.codigo)) {
        throw new Error('Ya existe una cuenta con ese código.');
      }
    }
    list[idx] = { ...list[idx], ...patch, actualizadoEn: new Date().toISOString() };
    this.write(list);
    return list[idx];
  }

  async remove(id: string): Promise<void> {
    await this.delay();
    const list = this.read();
    const next = list.filter(x => x.id !== id);
    this.write(next);
  }

  /** Semilla opcional */
  async seedIfEmpty() {
    const list = this.read();
    if (list.length) return;
    const now = new Date().toISOString();
    const base: PUCAccount[] = [
  ];
    this.write(base);
  }

  /* ========== (Opcional) Import local, por si quieres validar sin backend ========== */

  importarLocal = async (archivoMasivo: File, opts: ImportOpts = {}): Promise<ReporteMasivo> => {
    const ext = this._ext(archivoMasivo.name);
    let filas: any[] = [];

    if (ext === 'csv') {
      const texto = await this._readText(archivoMasivo);
      filas = this._csvToRows(texto);
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        const XLSX: any = await import('xlsx');
        const buf = new Uint8Array(await this._readArrayBuffer(archivoMasivo));
        const wb = XLSX.read(buf, { type: 'array' });
        const sn = wb.SheetNames[0];
        if (!sn) throw new Error('El archivo no contiene hojas.');
        const sheet = wb.Sheets[sn];
        filas = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      } catch {
        return { total: 0, validas: 0, invalidas: 0, errores: [{ fila: 0, codigo: '', errores: ['No fue posible leer XLSX. Instala "xlsx" o usa CSV.'] }] };
      }
    } else {
      return { total: 0, validas: 0, invalidas: 0, errores: [{ fila: 0, codigo: '', errores: ['Formato no soportado. Usa .csv/.xlsx/.xls'] }] };
    }

    const { reporte, validos } = this._validarFilas(filas);
    if (opts.dryRun) return reporte;

    const list = this.read();
    let inserted = 0, updated = 0;

    if (opts.upsert !== false) {
      for (const r of validos) {
        const idx = list.findIndex(x => x.codigo === r.codigo);
        if (idx >= 0) {
          list[idx] = { ...list[idx], nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza, tercero: r.tercero, activo: r.activo, actualizadoEn: new Date().toISOString() };
          updated++;
        } else {
          const now = new Date().toISOString();
          list.push({ id: crypto.randomUUID(), codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza, tercero: r.tercero, activo: r.activo, creadoEn: now, actualizadoEn: now } as PUCAccount);
          inserted++;
        }
      }
      this.write(list);
      return { total: reporte.total, validas: reporte.validas, invalidas: reporte.invalidas, insertedOrUpdated: inserted + updated, errores: reporte.errores };
    }

    const erroresExtra: ErrorFila[] = [];
    for (const r of validos) {
      if (list.some(x => x.codigo === r.codigo)) {
        erroresExtra.push({ fila: r.__fila, codigo: r.codigo, errores: ['Código duplicado existente (no se insertó)'] });
        continue;
      }
      const now = new Date().toISOString();
      list.push({ id: crypto.randomUUID(), codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, naturaleza: r.naturaleza, tercero: r.tercero, activo: r.activo, creadoEn: now, actualizadoEn: now } as PUCAccount);
      inserted++;
    }
    this.write(list);
    return { total: reporte.total, validas: reporte.validas, invalidas: reporte.invalidas + erroresExtra.length, inserted, errores: [...reporte.errores, ...erroresExtra] };
  };

  /* ================== Helpers privados (CSV/XLSX y validación) ================== */

  private _ext(name: string) {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  }

  private _readText(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error);
      fr.onload = () => res(String(fr.result || ''));
      fr.readAsText(file, 'utf-8');
    });
  }

  private _readArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error);
      fr.onload = () => res(fr.result as ArrayBuffer);
      fr.readAsArrayBuffer(file);
    });
  }

  private _csvToRows(text: string): any[] {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
    if (!lines.length) return [];
    const headers = this._splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this._splitCSVLine(lines[i]);
      if (cols.every(c => !String(c || '').trim())) continue;
      const obj: any = {};
      headers.forEach((h, idx) => obj[h] = cols[idx] ?? '');
      rows.push(obj);
    }
    return rows;
  }

  private _splitCSVLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  private _toBool(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return ['true','1','si','sí','x','activo','activa','yes','y'].includes(s);
  }

  private _validarFilas(filas: any[]) {
    const permitidosTipo: TipoPUC[] = ['ingreso','impuestos','pago','costo','gasto','otro'];
    const permitidosNat: Naturaleza[] = ['debito','credito'];

    const errores: ErrorFila[] = [];
    const validos: Array<any & { __fila: number }> = [];

    const vistosEnArchivo = new Set<string>();
    const norm = (k: string) => String(k ?? '').trim().toLowerCase();

    filas.forEach((r, idx) => {
      const fila = idx + 2; // encabezado 1
      const row: any = {};
      row.codigo = String(r['codigo'] ?? r['código'] ?? r['code'] ?? '').trim();
      row.nombre = String(r['nombre'] ?? r['name'] ?? '').trim();
      row.tipo = norm(r['tipo']);
      row.naturaleza = norm(r['naturaleza']);
      row.tercero = String(r['tercero'] ?? 'Documento').trim() || 'Documento';
      const activoRaw = r['activo'] ?? r['activa'] ?? r['estado'] ?? '';
      row.activo = this._toBool(activoRaw);

      const err: string[] = [];
      if (!row.codigo) err.push('codigo requerido');
      if (!row.nombre) err.push('nombre requerido');
      if (!permitidosTipo.includes(row.tipo)) err.push('tipo inválido');
      if (!permitidosNat.includes(row.naturaleza)) err.push('naturaleza inválida');

      if (row.codigo) {
        if (vistosEnArchivo.has(row.codigo)) err.push('código duplicado en el archivo');
        else vistosEnArchivo.add(row.codigo);
      }

      if (err.length) errores.push({ fila, codigo: row.codigo || '', errores: err });
      else validos.push({ ...row, __fila: fila });
    });

    const reporte: ReporteMasivo = {
      total: filas.length,
      validas: validos.length,
      invalidas: errores.length,
      errores,
    };

    return { reporte, validos };
  }




  listarPorEmpresa(empresaId: string): Observable<PaqueteResumen[]> {
    const url = `${this.apiBase}/cuentas/listar-paquetes`;
    console.log('[PKTS][REQ]', url, { empresaId });
    return this.http.get<PaqueteResumen[]>(url, { params: { empresaId } }).pipe(
      tap(res => console.log('[PKTS][RES]', res)),
      catchError(err => {
        console.error('[PKTS][ERR]', err);
        return of([] as PaqueteResumen[]);
      })
    );
  }

  /** POST /cuentas/crear-paquete */
  crear(body: CreatePaqueteBody) {
    return this.http.post(`${this.apiBase}/cuentas/crear-paquete`, body);
  }

  /** PATCH /cuentas/actualizar-paquete/:id */
  actualizar(id: string, body: Partial<CreatePaqueteBody>) {
    return this.http.patch(`${this.apiBase}/cuentas/actualizar-paquete/${id}`, body);
  }

  /** POST /cuentas/reemplazar-cuentas/:id */
  reemplazarCuentas(id: string, body: ReplaceCuentasBody) {
    return this.http.post(`${this.apiBase}/cuentas/reemplazar-cuentas/${id}`, body);
  }

  /** DELETE /cuentas/borrar-paquete/:id */
  borrar(id: string) {
    return this.http.delete(`${this.apiBase}/cuentas/borrar-paquete/${id}`);
  }

  /** DELETE /cuentas/borrar-cuenta/:id */
  borrarCuenta(id: string) {
    return this.http.delete(`${this.apiBase}/cuentas/borrar-cuenta/${id}`);
  }
}
