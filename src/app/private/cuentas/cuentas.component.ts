import { Component, OnInit } from '@angular/core';
import { CuentasService } from '../services/cuentas.service';
import { PUCAccount, TipoLineaPUC, Naturaleza } from './puc.models';
import { NgClass } from '@angular/common';
import { NgFor } from '@angular/common';
import { NgIf } from   '@angular/common';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';   
import { CommonModule } from '@angular/common';
import { MenuComponent } from "../menu/menu.component";   
import { finalize } from 'rxjs/operators';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ImportOpts } from '../services/cuentas.service';
import { TitleCasePipe } from '@angular/common';

type Modo = 'crear' | 'editar';
type SortField = 'codigo' | 'nombre' | 'tipo' | 'naturaleza' | 'tercero' | 'actualizadoEn';
type SortDir = 'asc' | 'desc';

type EstadoCodigo = 'activa' | 'inactiva';

interface ErrorFila {
  fila: number;
  codigo: string;
  errores: string[];
}



interface ReporteMasivo {
  total: number;
  validas?: number;
  invalidas?: number;
  inserted?: number;
  updated?: number;
  insertedOrUpdated?: number;
  errores: ErrorFila[];
}


@Component({
  selector: 'app-cuentas',
  standalone: true,
  imports: [NgClass, NgFor, FormsModule, NgIf, DatePipe, CommonModule, MenuComponent, TitleCasePipe],
  templateUrl: './cuentas.component.html',
  styleUrl: './cuentas.component.scss'
})
export class CuentasComponent implements OnInit {
  constructor(private api: CuentasService, private http: HttpClient) {}

  mostrarCargaMasiva = false;
  archivoMasivo: File | null = null;
  dryRun = true;
  upsert = true;
  estadoDefault: EstadoCodigo = 'activa';
  cargandoMasivo = false;
  reporteMasivo: ReporteMasivo | null = null;
  errorMasivo: string | null = null;


  loading = false;
  error = '';
  okMsg = '';
  readonly Math = Math; // ahora el template puede usar Math.*

  // Filtros
  search = '';
  filtroTipo: 'todos' | TipoLineaPUC = 'todos';
  filtroNaturaleza: 'todas' | Naturaleza = 'todas';
  soloActivos = true;

  // Orden & paginación
  sortBy: SortField = 'codigo';
  sortDir: SortDir = 'asc';
  pageSize = 10;
  page = 1;

  // Datos
  cuentas: PUCAccount[] = [];

  // Modal
  modalAbierto = false;
  modo: Modo = 'crear';
  seleccion: PUCAccount | null = null;
  form: Partial<PUCAccount> = {
    codigo: '', nombre: '', tipo: 'ingreso', naturaleza: 'debito',
    tercero: 'Documento', activo: true, notas: ''
  };

  private searchTimer: any;

  tipos: {label: string; value: TipoLineaPUC}[] = [
    { label: 'Ingreso', value: 'ingreso' },
    { label: 'Impuestos', value: 'impuestos' },
    { label: 'Pago', value: 'pago' },
    { label: 'Costo', value: 'costo' },
    { label: 'Gasto', value: 'gasto' },
    { label: 'Otro', value: 'otro' },
  ];
  naturalezas: {label: string; value: Naturaleza}[] = [
    { label: 'Débito', value: 'debito' },
    { label: 'Crédito', value: 'credito' }
  ];


  async ngOnInit() {
    await this.api.seedIfEmpty();
    await this.refrescar();
  }

  async refrescar() {
    this.loading = true;
    this.error = '';
    try {
      this.cuentas = await this.api.list({
        search: this.search,
        tipo: this.filtroTipo,
        naturaleza: this.filtroNaturaleza,
        soloActivos: this.soloActivos
      });
      this.page = 1; // volver a primera página al refrescar filtros
    } catch (e: any) {
      this.error = e?.message || 'Error al cargar cuentas.';
    } finally {
      this.loading = false;
    }
  }

  // --- Búsqueda con debounce
  onSearchChange() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.refrescar(), 220);
  }

  // --- Ordenamiento
  setSort(field: SortField) {
    if (this.sortBy === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortDir = 'asc';
    }
  }
  private cmp(a: any, b: any) { return a < b ? -1 : a > b ? 1 : 0; }
  get sorted(): PUCAccount[] {
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return [...this.cuentas].sort((x, y) => {
      const A = (x[this.sortBy] as any) ?? '';
      const B = (y[this.sortBy] as any) ?? '';
      return this.cmp(String(A).toLowerCase(), String(B).toLowerCase()) * dir;
    });
  }

  // --- Paginación
  get total() { return this.sorted.length; }
  get pageCount() { return Math.max(1, Math.ceil(this.total / this.pageSize)); }
  get pageItems(): PUCAccount[] {
    const start = (this.page - 1) * this.pageSize;
    return this.sorted.slice(start, start + this.pageSize);
  }
  prevPage() { if (this.page > 1) this.page--; }
  nextPage() { if (this.page < this.pageCount) this.page++; }

  // --- Modal
  abrirCrear() {
    this.modo = 'crear';
    this.seleccion = null;
    this.form = { codigo: '', nombre: '', tipo: 'ingreso', naturaleza: 'debito', tercero: 'Documento', activo: true, notas: '' };
    this.modalAbierto = true;
  }
  abrirEditar(c: PUCAccount) {
    this.modo = 'editar';
    this.seleccion = c;
    this.form = { codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza, tercero: c.tercero, activo: c.activo, notas: c.notas || '' };
    this.modalAbierto = true;
  }
  cerrarModal() { this.modalAbierto = false; this.error = ''; this.okMsg = ''; }

  private validate(): string | null {
    const f = this.form;
    if (!f.codigo?.trim()) return 'El código PUC es obligatorio.';
    if (!/^\d{4,}$/.test(f.codigo.trim())) return 'El código debe ser numérico y de 4+ dígitos.';
    if (!f.nombre?.trim()) return 'El nombre es obligatorio.';
    if (!f.tercero?.trim()) return 'Define el tercero (Documento o NIT).';
    return null;
  }

  async guardar() {
    const err = this.validate();
    if (err) { this.error = err; return; }
    this.loading = true;
    try {
      if (this.modo === 'crear') {
        await this.api.create({
          id: '' as any,
          codigo: this.form.codigo!.trim(),
          nombre: this.form.nombre!.trim(),
          tipo: this.form.tipo as TipoLineaPUC,
          naturaleza: this.form.naturaleza as Naturaleza,
          tercero: this.form.tercero!.trim(),
          activo: !!this.form.activo,
          notas: this.form.notas?.trim(),
          creadoEn: '' as any, actualizadoEn: '' as any,
        } as any);
      } else if (this.seleccion) {
        await this.api.update(this.seleccion.id, {
          codigo: this.form.codigo!.trim(),
          nombre: this.form.nombre!.trim(),
          tipo: this.form.tipo as TipoLineaPUC,
          naturaleza: this.form.naturaleza as Naturaleza,
          tercero: this.form.tercero!.trim(),
          activo: !!this.form.activo,
          notas: this.form.notas?.trim()
        });
      }
      await this.refrescar();
      this.cerrarModal();
    } catch (e: any) {
      this.error = e?.message || 'No se pudo guardar.';
    } finally {
      this.loading = false;
    }
  }

  async eliminar(c: PUCAccount) {
    if (!confirm(`¿Eliminar la cuenta ${c.codigo} - ${c.nombre}?`)) return;
    this.loading = true;
    try {
      await this.api.remove(c.id);
      await this.refrescar();
    } catch (e: any) {
      alert(e?.message || 'No se pudo eliminar.');
    } finally {
      this.loading = false;
    }
  }

  // util
  trackById = (_: number, row: PUCAccount) => row.id;



  abrirCargaMasiva(): void {
    this.mostrarCargaMasiva = true;
    this.reporteMasivo = null;
    this.errorMasivo = null;
    this.dryRun = true;
    this.upsert = true;
    this.archivoMasivo = null;
  }

  cerrarCargaMasiva(): void {
    this.mostrarCargaMasiva = false;
    this.archivoMasivo = null;
    this.cargandoMasivo = false;
    this.reporteMasivo = null;
    this.errorMasivo = null;
  }

  // Selección de archivo (queda igual)
onFileMasivo(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const file = input.files && input.files[0] ? input.files[0] : null;
  if (!file) { this.archivoMasivo = null; return; }

  const okExt = /\.(xlsx|xls|csv)$/i.test(file.name);
  if (!okExt) { this.errorMasivo = 'Formato no soportado. Usa .xlsx, .xls o .csv'; this.archivoMasivo = null; return; }

  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) { this.errorMasivo = 'El archivo supera el tamaño máximo de 8 MB.'; this.archivoMasivo = null; return; }

  this.errorMasivo = null;
  this.archivoMasivo = file;
}

// Plantilla CSV compatible con Excel (es-ES)
descargarPlantillaPUC(): void {
  const SEP = ';';              // Excel en español usa ; como separador
  const EOL = '\r\n';           // Fin de línea estilo Windows
  const BOM = '\uFEFF';         // BOM UTF-8 para tildes/ñ

  const rows = [
    ['codigo','nombre','tipo','naturaleza','nota','estado'],
    ['13050501','Clientes nacionales','ingreso','debito','', 'activo'],
    ['2408','IVA por pagar','impuestos','credito','', 'activo'],
  ];

  // csv con escape correcto
  const csv =
    BOM +
    rows
      .map(r => r.map(v => {
        const s = String(v ?? '');
        return (s.includes('"') || s.includes(SEP) || s.includes('\n') || s.includes('\r'))
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(SEP))
      .join(EOL) + EOL;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plantilla_cuentas_puc.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}


// Envío al backend (cambio: default 'activo')
// estado del modal
mensajeMasivo: string | null = null;

subirMasivo(): void {
  if (!this.archivoMasivo) { this.errorMasivo = 'Selecciona un archivo primero.'; return; }

  this.cargandoMasivo = true;
  this.errorMasivo = null;
  this.mensajeMasivo = null;            // ← limpiar mensaje
  this.reporteMasivo = null;

  const opts: ImportOpts = {
    dryRun: this.dryRun,
    upsert: this.upsert,
    estadoCodigoDefault: this.estadoDefault?.trim() || 'activo',
  };

  this.api.importar(this.archivoMasivo, opts)
    .pipe(finalize(() => (this.cargandoMasivo = false)))
    .subscribe({
      next: (res: ReporteMasivo) => {
        this.reporteMasivo = res;

        if (this.dryRun) {
          const inv = res.invalidas ?? 0;
          const val = res.validas ?? 0;
          this.mensajeMasivo = inv === 0
            ? `Validación OK. ${val} fila(s) listas para subir.`
            : `Validación incompleta: ${inv} fila(s) con error. Corrige y vuelve a validar.`;
        } else {
          const proc = res.insertedOrUpdated ?? ((res.inserted ?? 0) + (res.updated ?? 0));
          this.mensajeMasivo = `Importación completa. Procesadas: ${proc}.`;
          this.cerrarCargaMasiva?.();
          this.refrescar?.();
        }
      },
      error: (err: HttpErrorResponse) => {
        const payload = err?.error;
        if (payload?.errores && Array.isArray(payload.errores)) {
          const errores = payload.errores as ErrorFila[];
          this.reporteMasivo = {
            total: payload.total ?? errores.length,
            validas: payload.validas ?? 0,
            invalidas: payload.invalidas ?? errores.length,
            errores,
          };
          this.mensajeMasivo = null;
          this.errorMasivo = payload.message || 'Archivo con errores';
        } else {
          this.mensajeMasivo = null;
          this.errorMasivo = payload?.message || 'Ocurrió un error al procesar el archivo.';
        }
      },
    });
}




  limpiarArchivo(): void {
    this.archivoMasivo = null;
  }

  eliminarCuenta(id: string) {
    this.api.borrarCuenta(id).subscribe({
      next: () => {
        alert('✅ Cuenta eliminada correctamente. id: ' + id);
        this.refrescar(); // recarga la lista si tienes un método así
      },
      error: (err) => {
        console.error(err);
        alert('❌ Ocurrió un error al eliminar la cuenta.');
      },
    });
  }

}