import { Component, computed, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, FormGroup, FormControl, FormsModule,ReactiveFormsModule } from '@angular/forms';
import { MenuComponent } from '../menu/menu.component';
import {EmpresasService} from '../services/api.service';
import { map } from 'rxjs';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ElementRef, ViewChild } from '@angular/core';
import { CuentasService } from '../services/cuentas.service';
type Naturaleza = 'debito' | 'credito';
type TipoXML = 'emitidos' | 'recibidos';

function getCodigoYNom(item: any): { codigo: string; nombre?: string } {
  const codigo = (item?.codigo ?? item?.cuenta ?? '').toString();
  const nombre = item?.nombre ?? '';
  return { codigo, nombre };
}


interface PaqueteResponse {
  id: string;
  nombre: string;
  descripcion?: string;
  fechaCreacion: string;
}

interface PUCAccount {
  codigo: string;
  nombre: string;
  nivel?: number;
  sugerida?: Naturaleza;
}
export interface CrearEmpresaDto {
  nombre: string;
  nit: string;
}
interface Contabilizacion {
  id: string;
  nombre: string;
  periodo: string;          
  tipoXml: TipoXML;        
  descripcion?: string; 
  aplicaATodos: boolean;
  cuentas: Array<{
    cuenta: string;
    tipo: 'ingreso' | 'impuestos' | 'pago' | 'costo' | 'gasto' | 'otro';
    naturaleza: Naturaleza;
    tercero: string;         
  }>;
  updatedAt: string;         
}

type BackEmpresa = Partial<Empresa> & { id: string; nombre: string; nit: string };

export interface Empresa {
  id: string;
  nombre: string;
  nit: any;
  codigo: string;
  centroOperacion?: string;
  estado: 'activa' | 'inactiva';
  contabilizaciones: Contabilizacion[];
}

interface CuentaEditable {
  cuentaCodigo: string;
  cuentaNombre: string;
  tipo: 'ingreso'|'impuestos'|'pago'|'costo'|'gasto'|'otro';
  naturaleza: Naturaleza;
  tercero: string;
}

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [MenuComponent, CommonModule, FormsModule,ReactiveFormsModule],
  templateUrl: './empresas.component.html',
  styleUrls: ['./empresas.component.scss']
})
export class EmpresasComponent {
  constructor(private empresasService: EmpresasService,private fb: FormBuilder,private cuentasService: CuentasService){
    this.formEmpresa = this.fb.nonNullable.group({
      nombre: ['', [Validators.required, Validators.maxLength(180)]],
      nit: ['', [Validators.required, Validators.maxLength(50)]],
    });

  }

  @ViewChild('focusNombre') focusNombre!: ElementRef<HTMLInputElement>;

  mostrarModalEmpresa = false;
  loading = false;
  submitted = false;
  serverError = '';
 
  formEmpresa!: FormGroup<{
    nombre: FormControl<string>;
    nit: FormControl<string>;
  }>;


  abrirModalEmpresa() {
    this.serverError = '';
    this.submitted = false;
    this.formEmpresa.reset();
    this.mostrarModalEmpresa = true;

    // Dar tiempo a que el modal aparezca en el DOM
    setTimeout(() => this.focusNombre?.nativeElement?.focus(), 0);
  }

  cerrarModalEmpresa() {
    if (this.loading) return;
    this.mostrarModalEmpresa = false;
  }
  
  crearEmpresa() {
    this.submitted = true;
    this.serverError = '';
    if (this.formEmpresa.invalid) return;

    this.loading = true;
    const dto = this.formEmpresa.getRawValue(); // { nombre, nit }

    this.empresasService.crear(dto).subscribe({
      next: (empresaCreada) => {
        this.loading = false;
        this.mostrarModalEmpresa = false;
        // refresca tu listado; si tienes un método, llámalo aquí
        this.cargar();
      },
      error: (err) => {
        this.loading = false;
        this.serverError = err?.error?.message ?? 'No se pudo crear la empresa.';
      }
    });
  }

empresas = signal<Empresa[]>([]);
cargando = signal(false);
error = signal<string|null>(null);

  ngOnInit(): void { this.cargar(); 
    this.cargarPucCatalogo(); 
  }

  private cargar() {
    this.cargando.set(true);
  
    this.empresasService.getEmpresas() // Observable<Empresa[] del backend>
      .pipe(
        map((rows: any[]) => rows as any[]), // BackEmpresa[]
        switchMap((rows) => {
          // mapeo base de empresas
          const baseEmpresas: Empresa[] = rows.map((e: any, i: number) => ({
            id: e.id,
            nombre: e.nombre,
            nit: e.nit,
            codigo: e.codigo ?? this.buildCodigo(e.nombre, e.nit, i),
            centroOperacion: e.centroOperacion ?? 'CO-01',
            estado: (e.estado as Empresa['estado']) ?? 'activa',
            contabilizaciones: (e.contabilizaciones ?? []),
            paquetes: [] // se rellena luego
          }));
  
          // para cada empresa, pedir sus paquetes
          const calls = baseEmpresas.map(emp =>
            this.cuentasService.listarPorEmpresa(emp.id).pipe(
              map(pkts => ({ empId: emp.id, paquetes: pkts }))
            )
          );
  
          // si no hay empresas, evitar forkJoin vacío
          return calls.length ? forkJoin(calls).pipe(map(res => ({ baseEmpresas, res })))
                              : of({ baseEmpresas, res: [] as any[] });
        }),
        map(({ baseEmpresas, res }) => {
          // fusiona los paquetes en la empresa correspondiente
          const byId = new Map<string, Empresa>(baseEmpresas.map(e => [e.id, e]));
          for (const r of res) {
            const emp = byId.get(r.empId);
            if (emp) emp.contabilizaciones = r.paquetes;
          }
          return Array.from(byId.values());
        })
      )
      .subscribe({
        next: (empresasConPaquetes: Empresa[]) => {
          this.empresas.set(empresasConPaquetes);
          this.cargando.set(false);
        },
        error: (err) => {
          console.error('Error cargando empresas/paquetes', err);
          this.cargando.set(false);
        }
      });
  }

  private buildCodigo(nombre: string, nit: string, idx: number) {
    const siglas = (nombre ?? '')
      .trim().split(/\s+/).map(w => w[0]).join('').slice(0,2).toUpperCase() || 'EM';
    const suf = (nit ?? String(idx+1)).slice(-2).padStart(2,'0');
    return `${siglas}-${suf}`;
  }
  
  query = signal<string>('');
  filtroEstado = signal<'todas' | 'activa' | 'inactiva'>('todas');
  filtroTipo   = signal<'todos' | 'emitidos' | 'recibidos'>('todos');

  filtradas = computed(() => {
    const q  = this.query().trim().toLowerCase();
    const fe = this.filtroEstado();
    const ft = this.filtroTipo();

    return this.empresas()
      .map(e => ({
        ...e,
        contabilizaciones: e.contabilizaciones.filter(c => (ft === 'todos' ? true : c.tipoXml === ft))
      }))
      .filter(e => {
        if (fe !== 'todas' && e.estado !== fe) return false;
        const blob = `${e.nombre} ${e.nit} ${e.codigo} ${e.centroOperacion ?? ''}`.toLowerCase();
        return q ? blob.includes(q) : true;
      });
  });


  modalOpen = signal(false);
  modalEmpresaId = signal<string | null>(null);
  editContId = signal<string | null>(null);

  form = signal<Partial<Contabilizacion>>({
    nombre: '',
    periodo: '2025-09',
    tipoXml: 'emitidos',
    aplicaATodos: true,
  });

  patchForm(patch: Partial<Contabilizacion>) {
    this.form.set({ ...this.form(), ...patch });
  }

  abrirCrearContabilizacion(empresaId: string) {
    this.modalEmpresaId.set(empresaId);
    this.editContId.set(null);
    this.form.set({ nombre: '', periodo: '2025-09', tipoXml: 'emitidos', aplicaATodos: true });
    this.modalOpen.set(true);
  }

  async guardarContabilizacion() {
    const empId = this.modalEmpresaId();
    if (!empId) return;
  
    const data = this.form();
    if (!data.nombre || !data.periodo) return;
  
    const list = [...this.empresas()];
    const i = list.findIndex(e => e.id === empId);
    if (i < 0) return;
  
    // EDITAR CONTABILIZACIÓN (no crea paquete)
    if (this.editContId()) {
      list[i].contabilizaciones = list[i].contabilizaciones.map(c =>
        c.id === this.editContId()
          ? { ...c, ...data, updatedAt: new Date().toISOString() } as Contabilizacion
          : c
      );
      this.empresas.set(list);
      this.modalOpen.set(false);
      this.modalEmpresaId.set(null);
      this.editContId.set(null);
      return;
    }
  
    // NUEVA CONTABILIZACIÓN → Crear paquete vacío en backend
    this.cargando?.set?.(true);
    try {
      const body = {
        empresaId: empId,
        nombre: data.nombre!,                           // nombre del paquete
        descripcion: (data.tipoXml ?? 'emitidos')       // tipo XML como descripción
        // sin 'cuentas' => paquete vacío
      };
  
      const resp = await this.cuentasService
        .crear(body)
        .pipe(map(r => r as PaqueteResponse))
        .toPromise();
  
      // Crear la contabilización local como ya lo hacías
      const nuevo: Contabilizacion = {
        id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
        nombre: data.nombre!,
        periodo: data.periodo!,
        tipoXml: (data.tipoXml ?? 'emitidos') as TipoXML,
        aplicaATodos: !!data.aplicaATodos,
        cuentas: [],
        updatedAt: new Date().toISOString(),
        // opcional: guarda el id del paquete para enlazar después
        // paqueteId: resp?.id,
      };
  
      list[i].contabilizaciones = [nuevo, ...list[i].contabilizaciones];
      this.empresas.set(list);
  
      // (Opcional) refrescar paquetes del backend y guardarlos en la empresa
      // const paquetes = await firstValueFrom(this.paquetesService.listarPorEmpresa(empId));
      // this.empresas.set(this.empresas().map(e => e.id === empId ? ({ ...e, paquetes }) : e));
    } catch (err) {
      console.error('Error creando paquete vacío', err);
    } finally {
      this.cargando?.set?.(false);
      this.modalOpen.set(false);
      this.modalEmpresaId.set(null);
      this.editContId.set(null);
    }
  }
  
  pucCatalog = signal<PUCAccount[]>([]);
  pucQuery   = signal<string>('');
  // ...
  
  private _pucLoaded = false;
  
  async cargarPucCatalogo() {
    if (this._pucLoaded) return;
  
    try {
      // Reutiliza tu list(); si tu list permite page/pageSize, usa un pageSize grande.
      // Si no, con la 1ª página suele alcanzar para autocompletar.
      const items = await this.cuentasService.list({
        search: '',          // todo
        soloActivos: true,   // solo activas
        // page: 1, pageSize: 1000, // <- si tu list ya acepta estos opcionales
      });
  
      // Añade la propiedad `sugerida` desde la naturaleza
      const conSugerida = items.map(x => ({
        ...x,
        sugerida: x.naturaleza, // 'debito' | 'credito'
      })) as PUCAccount[];
  
      this.pucCatalog.set(conSugerida);
      this._pucLoaded = true;
    } catch (e) {
      console.error('PUC catalog load failed', e);
      // si falla, deja el arreglo como estaba (tu semilla hardcoded si la tenías)
    }
  }


  modalCuentasOpen = signal(false);
  modalCtasEmpresaId = signal<string|null>(null);
  modalCtasContId    = signal<string|null>(null);
  cuentasEdit = signal<CuentaEditable[]>([]);

  sugeridaPorCodigo(codigo: string | null | undefined): 'debito' | 'credito' | '—' {
    if (!codigo) return '—';
    const item = this.pucCatalog().find(p => p.codigo === codigo);
    return (item?.sugerida ?? '—');
  }

  filteredPUC() {
    const q = (this.pucQuery() || '').trim().toLowerCase();
    if (!q) return [];
    return this.pucCatalog().filter(p =>
      p.codigo.includes(q) || p.nombre.toLowerCase().includes(q)
    ).slice(0, 10);
  }


  abrirEditarCuentas(empresaId: string, paqueteId: string) {
    const emp = this.empresas().find(e => e.id === empresaId);
    const pkt = emp?.contabilizaciones?.find(p => p.id === paqueteId);
    if (!emp || !pkt) return;
  
    this.modalCtasEmpresaId.set(empresaId);
    this.modalCtasContId.set(paqueteId);
  
    const rows: CuentaEditable[] = (pkt.cuentas ?? []).map((c: any) => {
      const { codigo, nombre } = getCodigoYNom(c);       // <-- aquí
      const found = this.pucCatalog().find(p => p.codigo === codigo);
      const sugerida = this.sugeridaPorCodigo(codigo);   // 'debito' | 'credito' | '—'
  
      return {
        cuentaCodigo: codigo,
        cuentaNombre: found?.nombre ?? nombre ?? '',
        tipo: 'ingreso',                                  // ajusta si tienes el tipo en el item
        naturaleza: (sugerida === 'debito' || sugerida === 'credito') ? sugerida : 'debito',
        tercero: 'Documento',
      };
    });
  
    this.cuentasEdit.set(rows.length ? rows : [{
      cuentaCodigo: '', cuentaNombre: '', tipo: 'otro', naturaleza: 'debito', tercero: 'Documento'
    }]);
  
    this.modalCuentasOpen.set(true);
  }
  

  cerrarModalCuentas() {
    this.modalCuentasOpen.set(false);
    this.modalCtasEmpresaId.set(null);
    this.modalCtasContId.set(null);
    this.cuentasEdit.set([]);
    this.pucQuery.set('');
  }

  addCuentaRow() {
    const list = [...this.cuentasEdit()];
    list.unshift({
      cuentaCodigo: '',
      cuentaNombre: '',
      tipo: 'ingreso',
      naturaleza: 'debito',
      tercero: 'Documento',
    });
    this.cuentasEdit.set(list);
  }

  removeCuentaRow(idx: number) {
    const list = [...this.cuentasEdit()];
    list.splice(idx, 1);
    this.cuentasEdit.set(list);
  }

  setRowField<T extends keyof CuentaEditable>(idx: number, field: T, value: CuentaEditable[T]) {
    const list = [...this.cuentasEdit()];
    list[idx] = { ...list[idx], [field]: value };
    this.cuentasEdit.set(list);
  }

  selectPUCForRow(idx: number, acc: PUCAccount) {
    const nat = acc.sugerida ?? this.cuentasEdit()[idx].naturaleza;
    const list = [...this.cuentasEdit()];
    list[idx] = {
      ...list[idx],
      cuentaCodigo: acc.codigo,
      cuentaNombre: acc.nombre,
      naturaleza: nat,
    };
    this.cuentasEdit.set(list);
    this.pucQuery.set('');
  }
  async guardarCuentasPUC() {
    const empId = this.modalCtasEmpresaId();
    const paqueteId = this.modalCtasContId(); // aquí guardamos el id del paquete
    if (!empId || !paqueteId) return;
  
    // 1) Resolver códigos → cuentaId usando tu catálogo PUC cargado en memoria
    const catalog = this.pucCatalog(); // debe contener { codigo, nombre, id? }
    const faltantes: string[] = [];
  
    const cuentasForApi = this.cuentasEdit().map((r, idx) => {
      const found: any = catalog.find(p => p.codigo === r.cuentaCodigo);
      if (!found || !found.id) { faltantes.push(r.cuentaCodigo); }
      return {
        cuentaId: found?.id as string, // <-- id de cuentas_puc
        orden: idx + 1,                // puedes usar r.orden si ya lo manejas
      };
    }).filter(x => !!x.cuentaId);
  
    if (!cuentasForApi.length) {
      alert('No hay cuentas válidas para guardar.');
      return;
    }
    if (faltantes.length) {
      alert(`Faltan en catálogo PUC (sin id): ${faltantes.join(', ')}`);
      return;
    }
  
    // 2) Llamar backend para reemplazar/guardar las cuentas del paquete
    try {
      await this.cuentasService.reemplazarCuentas(paqueteId, { cuentas: cuentasForApi }).toPromise();
  
      // 3) Actualizar estado local (tu UI interna de "contabilizaciones")
      const empresas = [...this.empresas()];
      const ei = empresas.findIndex(e => e.id === empId);
      if (ei >= 0) {
        const ci = empresas[ei].contabilizaciones.findIndex(c => c.id === paqueteId);
        if (ci >= 0) {
          const cuentasMapped = this.cuentasEdit().map(r => ({
            cuenta: r.cuentaCodigo,
            tipo: r.tipo,
            naturaleza: r.naturaleza,
            tercero: r.tercero,
          }));
          empresas[ei].contabilizaciones[ci] = {
            ...empresas[ei].contabilizaciones[ci],
            cuentas: cuentasMapped,
            updatedAt: new Date().toISOString(),
          };
          this.empresas.set(empresas);
        }
      }
  
      this.cerrarModalCuentas();
    } catch (err) {
      console.error('Error guardando cuentas del paquete', err);
      alert('No se pudieron guardar las cuentas del paquete.');
    }
  }
tipoXmlDe(c: any): 'emitidos' | 'recibidos' | undefined {
  return (c?.tipoXml as any) || (c?.descripcion as any) || undefined;
}
confirmarEliminacionPaquete(paqueteId: string) {
  const confirmar = confirm('¿Seguro que deseas eliminar este paquete? Esta acción no se puede deshacer.');
  if (!confirmar) return;

  this.eliminarPaquete(paqueteId);
}

eliminarPaquete(id: string) {
  this.cuentasService.borrar(id).subscribe({
    next: () => {
      alert('✅ Paquete eliminado correctamente. id: ' + id);
      this.cargar(); // recarga la lista si tienes un método así
    },
    error: (err) => {
      console.error(err);
      alert('❌ Ocurrió un error al eliminar el paquete.');
    },
  });
}



}
