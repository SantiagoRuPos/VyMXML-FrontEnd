import { Component, signal } from '@angular/core';
import { NgIf, NgFor,NgClass,DecimalPipe,DatePipe   } from '@angular/common';
import { MenuComponent } from '../menu/menu.component';
import { FormsModule } from '@angular/forms';
import { ContabilizacionExcelService, PUCLinea } from '../services/contabilizacion-excel.service';
import { EmpresasService } from '../services/api.service';
import { CuentasService } from '../services/cuentas.service';
import { TitleCasePipe } from '@angular/common';
import { ContabilizacionRecibidosService } from '../services/contabilizacion-recibidos.service';
// al inicio del archivo

type TipoXML = 'emitidos' | 'recibidos';

// Interfaces para tipar opciones
interface ImpuestoOpcion {
  codigo: string;       // id corto interno, ej: 'RF_COMPRAS_DECL'
  nombre: string;       // etiqueta visible
  tarifaTexto: string;  // ej: '2,5%', '15% sobre IVA', '4% sobre AIU'
  baseMin?: string;     // opcional, texto: '≥ 10 UVT', '≥ $498.000', etc.
  notas?: string;       // opcional
  grupo: 'ReteFuente' | 'ReteIVA' | 'Otros';
}

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
  descripcion?: string;                         // aquí viene 'emitidos' | 'recibidos'
  fechaCreacion: string;
  cuentas: PaqueteCuentaResumen[];
}

type Empresa = { id: string; nombre: string };
type Plan = { id: string; nombre: string };
type Lote = {
  id: string;
  empresaNombre: string;
  tipo: 'EMITIDOS'|'RECIBIDOS';
  ok: number;
  err: number;
  estado: 'EN PROCESO'|'PROCESADO';
  fecha: string;
};
type Item = {
  descripcion: string;
  cantidad: number;
  iva: number;       // %
  unitario: number;  // PriceAmount
  total: number;     // cálculo desde unitario*cantidad*(1+iva)
};

interface FacturaHeader {
  numero: string;
  fecha: string;
  proveedor: string;
  cliente: string;
  moneda: string;
  cufe: string;
  clienteTipoId?: string;   // <- NUEVO
  clienteNumeroId?: string; // <- NUEVO
}


type ParsedDoc = {
  id: string;
  filename: string;
  header: FacturaHeader;
  items: Item[];
  totals: { subtotal: number; iva: number; total: number };
  raw: string;
};
// Catálogo (resumido) basado en tu tabla PDF
const IMPUESTOS_2025: ImpuestoOpcion[] = [
  // ——— RETEFUENTE ———
  { codigo: 'RF_ARR_INMUEBLES', nombre: 'Arrendamiento de bienes inmuebles', tarifaTexto: '3,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_ARR_MUEBLES', nombre: 'Arrendamiento de bienes muebles', tarifaTexto: '4%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_BR_NO_VIV', nombre: 'Compra de bien raíz uso diferente a vivienda', tarifaTexto: '2,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_BR_VIV_EXCESO_20000UVT', nombre: 'Compra de bien raíz para vivienda (exceso sobre 20.000 UVT)', tarifaTexto: '2,5%', baseMin: 'excedente sobre 10.000 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_BR_VIV_HASTA_20000UVT', nombre: 'Compra de bien raíz para vivienda (hasta 20.000 UVT)', tarifaTexto: '1%', baseMin: '≥ 10 UVT hasta 10.000 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_COMBUSTIBLE', nombre: 'Compras de combustibles derivados del petróleo', tarifaTexto: '0,10%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_COMPRAS_DECL', nombre: 'Compras generales (declarantes renta)', tarifaTexto: '2,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_COMPRAS_NO_DECL', nombre: 'Compras generales (no declarantes renta)', tarifaTexto: '3,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_CONSTRUCCION', nombre: 'Contratos de construcción y urbanización', tarifaTexto: '2%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_ENAJEN_ACT_FIJOS_PN', nombre: 'Enajenación de activos fijos (personas naturales)', tarifaTexto: '1%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_HON_CONTR_3300UVT', nombre: 'Honorarios/Comisiones (PJ y PN con contratos > 3.300 UVT)', tarifaTexto: '11%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_HON_NO_DECL', nombre: 'Honorarios/Comisiones (no declarantes)', tarifaTexto: '10%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_HON_PJ', nombre: 'Honorarios/Comisiones (personas jurídicas)', tarifaTexto: '11%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_HOTELES_REST', nombre: 'Hoteles y restaurantes', tarifaTexto: '3,5%', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_OTROS_DECL', nombre: 'Otros ingresos tributarios (declarantes renta)', tarifaTexto: '2,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_OTROS_NO_DECL', nombre: 'Otros ingresos tributarios (no declarantes renta)', tarifaTexto: '3,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_SALUD_IPS', nombre: 'Servicios integrales de salud (IPS)', tarifaTexto: '2%', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_SERV_TEMP_AIU', nombre: 'Servicios temporales (sobre AIU)', tarifaTexto: '1% sobre AIU', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_SERVICIOS_DECL', nombre: 'Servicios generales (declarantes renta)', tarifaTexto: '4%', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_SERVICIOS_NO_DECL', nombre: 'Servicios generales (no declarantes renta)', tarifaTexto: '6%', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_SOFTWARE', nombre: 'Licenciamiento y derecho de uso de software', tarifaTexto: '3,5%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_TARJETA_DB_CR', nombre: 'Compras con tarjeta débito/crédito', tarifaTexto: '1,5%', baseMin: 'sin base', grupo: 'ReteFuente' },
  { codigo: 'RF_TRANSP_CARGA', nombre: 'Transporte nacional de carga', tarifaTexto: '1%', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_TRANSP_PASAJEROS', nombre: 'Transporte nacional de pasajeros (vía terrestre)', tarifaTexto: '3,5%', baseMin: '≥ 10 UVT', grupo: 'ReteFuente' },
  { codigo: 'RF_VIG_ASEO_AIU', nombre: 'Vigilancia / Aseo (sobre AIU)', tarifaTexto: '2% sobre AIU', baseMin: '≥ 2 UVT', grupo: 'ReteFuente' },

  // ——— RETEIVA ———
  { codigo: 'RIVA_COMPRAS', nombre: 'ReteIVA por compras', tarifaTexto: '15% sobre IVA', baseMin: '≥ 10 UVT', grupo: 'ReteIVA' },
  { codigo: 'RIVA_SERVICIOS', nombre: 'ReteIVA por servicios', tarifaTexto: '15% sobre IVA', baseMin: '≥ 2 UVT', grupo: 'ReteIVA' },

  // ——— OTROS ———
  { codigo: 'OTROS_INTERESES', nombre: 'Intereses y rendimientos financieros', tarifaTexto: '7%', baseMin: 'sin base', grupo: 'Otros' },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MenuComponent,NgFor, NgIf, FormsModule,NgClass,DecimalPipe,DatePipe,TitleCasePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
  empresas: Empresa[] = [];
  loading = false;
  error = '';

  ngOnInit(): void {
    this.loading = true;
    this.empresasSvc.getEmpresas().subscribe({
      next: (list) => { this.empresas = list ?? []; this.loading = false; },
      error: (err) => { this.error = 'No se pudieron cargar las empresas'; this.loading = false; }
    });
  }

 

  periodo = new Date().toISOString().slice(0, 7);
  tipo: 'EMITIDOS' | 'RECIBIDOS' = 'RECIBIDOS';


  planes: Plan[] = [
    { id: 'p1', nombre: 'Plan PUC base' },
    { id: 'p2', nombre: 'Plan personalizado' },
  ];

  empresaId: string | null = null;
  planId: string | null = null;

  get empresaNombre(): string {
    return this.empresas.find(e => e.id === this.empresaId)?.nombre ?? '';
  }

  // Archivos seleccionados
  archivos: File[] = [];
  resumenArchivos = '';

  // Vista actual (lo que renderiza la factura)
  items: Item[] = [];
  totales = { subtotal: 0, iva: 0, total: 0 };
  encabezado: FacturaHeader | null = null;
  xmlCrudo = '';

  // KPIs + actividad
  kpi = { facturas: 0, impuestos: 0, retenciones: 0, asientos: 0 };
  actividad: Lote[] = [];

  // Colección de documentos
  docs: ParsedDoc[] = [];
  selectedDocIndex = 0;

  onFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const valid = files.filter(f => /\.xml$/i.test(f.name));
    const invalid = files.length - valid.length;

    this.archivos = valid;
    this.resumenArchivos = `${valid.length} XML listo(s) · ${invalid} no válidos`;
  }

  onNuevoLote() { this.onLimpiar(); }

  onLimpiar() {
    this.tipo = 'RECIBIDOS';
    this.empresaId = null;
    this.planId = null;
    this.archivos = [];
    this.resumenArchivos = '';

    // Limpia vista actual
    this.items = [];
    this.totales = { subtotal: 0, iva: 0, total: 0 };
    this.encabezado = null;
    this.xmlCrudo = '';

    // Limpia lista de docs
    this.docs = [];
    this.selectedDocIndex = 0;
  }

  constructor(private contaExcel: ContabilizacionExcelService,private empresasSvc: EmpresasService,private cuentasSvc: CuentasService,private contaRecibidos: ContabilizacionRecibidosService) {}


async onProcesar() {
  // Validaciones con el nuevo flujo
  if (!this.empresaId) {
    alert('Selecciona la empresa.');
    return;
  }
  if (!this.paqueteSelId || !this.paqueteSeleccionado?.length) {
    alert('Selecciona el plan de cuentas (paquete).');
    return;
  }
  if (!this.archivos?.length) {
    alert('Carga al menos un XML o ZIP.');
    return;
  }

  // (opcional) nombre de empresa si lo necesitas en la actividad
  const emp = (this.empresas ?? []).find(e => e.id === this.empresaId);
  const empresaNombreTmp = emp?.nombre ?? this.empresaNombre ?? '';

  // Procesamiento de archivos
  const texts = await Promise.all(
    this.archivos.map(f => this.readFileText(f).catch(() => null))
  );

  let ok = 0, err = 0;
  const parsedDocs: ParsedDoc[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const file = this.archivos[i];
    if (!t) { err++; continue; }

    try {
      const items = this.parseUBLInvoiceToItems(t);
      if (!items.length) { err++; continue; }

      const subtotal = items.reduce((a, it) => a + it.unitario * it.cantidad, 0);
      const ivaVal   = items.reduce((a, it) => a + (it.unitario * it.cantidad) * (it.iva / 100), 0);
      const total    = subtotal + ivaVal;

      const header = this.extractHeader(t);

      parsedDocs.push({
        id: crypto.randomUUID(),
        filename: file.name,
        header,
        items,
        totals: { subtotal, iva: ivaVal, total },
        raw: t
      });

      ok++;
    } catch {
      err++;
    }
  }

  // Guarda la lista y muestra el primero
  this.docs = parsedDocs;
  this.selectedDocIndex = 0;
  this.applySelection(0); // <- si usa paqueteSeleccionado internamente, ya está listo

  // KPIs & actividad
  this.kpi.facturas += ok;
  this.kpi.asientos += ok;
  this.actividad.unshift({
    id: crypto.randomUUID(),
    empresaNombre: this.empresaNombre,
    tipo: this.tipo,                 // <-- usar el nuevo tipo seleccionado (emitidos/recibidos)
    ok, err,
    estado: 'PROCESADO',
    fecha: new Date().toISOString()
  });

  // limpiar input
  this.archivos = [];
  this.resumenArchivos = `${ok} XML procesado(s) · ${err} con error`;

  if (this.tipo !== 'RECIBIDOS') return;
  const idx = this.selectedDocIndex ?? 0;
  this.mostrarSelectorImpuestoPara[idx] = true; // enciende el combo para ese XML
}

  // Cambia la vista al doc elegido
  applySelection(index: number) {
    if (index < 0 || index >= this.docs.length) return;
    this.selectedDocIndex = index;

    const d = this.docs[index];
    this.items = d.items;
    this.totales = d.totals;
    this.encabezado = d.header;
    this.xmlCrudo = d.raw;

    // opcional: mostrar automáticamente el selector si ya hay selección previa
    if (this.tipo === 'RECIBIDOS' && this.impuestoSeleccionadoPara[index] != null) {
      this.mostrarSelectorImpuestoPara[index] = true;
    }
  }

  prevDoc() { if (this.docs.length) this.applySelection((this.selectedDocIndex - 1 + this.docs.length) % this.docs.length); }
  nextDoc() { if (this.docs.length) this.applySelection((this.selectedDocIndex + 1) % this.docs.length); }

  // ================== Helpers y parsing ==================
  private readFileText(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsText(file);
    });
  }

  private parseUBLInvoiceToItems(xmlText: string): Item[] {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML mal formado');

    const NS = {
      cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
    };

    let lines = Array.from(doc.getElementsByTagNameNS(NS.cac, 'InvoiceLine'));
    if (!lines.length) lines = Array.from(doc.getElementsByTagNameNS(NS.cac, 'CreditNoteLine'));
    if (!lines.length) {
      lines = Array.from(doc.getElementsByTagName('InvoiceLine'));
      if (!lines.length) lines = Array.from(doc.getElementsByTagName('CreditNoteLine'));
    }
    if (!lines.length) return [];

    const items: Item[] = [];
    for (const ln of lines) {
      const itemNode =
        ln.getElementsByTagNameNS(NS.cac, 'Item')[0] ||
        ln.getElementsByTagName('cac:Item')[0] ||
        ln.getElementsByTagName('Item')[0];

      const desc =
        this.textFirst(itemNode?.getElementsByTagNameNS(NS.cbc, 'Description')) ||
        this.textFirst(itemNode?.getElementsByTagName('cbc:Description') as any) ||
        this.textFirst(itemNode?.getElementsByTagNameNS(NS.cbc, 'Name')) ||
        this.textFirst(itemNode?.getElementsByTagName('cbc:Name') as any) ||
        'Ítem sin descripción';

      const qtyStr =
        this.textFirst(ln.getElementsByTagNameNS(NS.cbc, 'InvoicedQuantity')) ||
        this.textFirst(ln.getElementsByTagNameNS(NS.cbc, 'CreditedQuantity')) ||
        this.textFirst(ln.getElementsByTagName('cbc:InvoicedQuantity') as any) ||
        this.textFirst(ln.getElementsByTagName('cbc:CreditedQuantity') as any) ||
        this.textFirst(ln.getElementsByTagName('InvoicedQuantity') as any) ||
        this.textFirst(ln.getElementsByTagName('CreditedQuantity') as any) ||
        '0';
      const cantidad = this.num(qtyStr);

      const priceNode =
        ln.getElementsByTagNameNS(NS.cac, 'Price')[0] ||
        ln.getElementsByTagName('cac:Price')[0] ||
        ln.getElementsByTagName('Price')[0];

      const unitStr =
        this.textFirst(priceNode?.getElementsByTagNameNS(NS.cbc, 'PriceAmount')) ||
        this.textFirst(priceNode?.getElementsByTagName('cbc:PriceAmount') as any) ||
        '0';
      const unitario = this.num(unitStr);

      let ivaPercent = 0;
      const taxTotals = ln.getElementsByTagNameNS(NS.cac, 'TaxTotal');
      if (taxTotals.length) {
        const sub = (taxTotals[0] as Element).getElementsByTagNameNS(NS.cac, 'TaxSubtotal')[0]
                 || (taxTotals[0] as Element).getElementsByTagName('cac:TaxSubtotal')[0];
        const p = this.textFirst(sub?.getElementsByTagNameNS(NS.cbc, 'Percent'))
               || this.textFirst(sub?.getElementsByTagName('cbc:Percent') as any)
               || '0';
        ivaPercent = this.num(p);
      }

      const lineExtStr =
        this.textFirst(ln.getElementsByTagNameNS(NS.cbc, 'LineExtensionAmount')) ||
        this.textFirst(ln.getElementsByTagName('cbc:LineExtensionAmount') as any) || '';
      const base = lineExtStr ? this.num(lineExtStr) : unitario * cantidad;
      const ivaValor = base * (ivaPercent / 100);
      const total = base + ivaValor;

      items.push({ descripcion: desc, cantidad, iva: ivaPercent, unitario, total });
    }
    return items;
  }

  private extractHeader(xmlText: string): FacturaHeader {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const NS = {
      inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
      crn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
      cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
    };

    const root = doc.documentElement;
    const get = (parent: Element | Document, ns: string, tag: string) =>
      this.textFirst(parent.getElementsByTagNameNS(ns, tag)) ||
      this.textFirst((parent as any).getElementsByTagName(`cbc:${tag}`)) ||
      this.textFirst((parent as any).getElementsByTagName(tag));

    const numero = get(root, NS.cbc, 'ID');
    const fecha  = get(root, NS.cbc, 'IssueDate') || get(root, NS.cbc, 'IssueDateTime');
    const moneda = get(root, NS.cbc, 'DocumentCurrencyCode') || get(root, NS.cbc, 'PricingCurrencyCode') || '';
    const cufe   = get(root, NS.cbc, 'UUID') || '';

    const sup = root.getElementsByTagNameNS(NS.cac, 'AccountingSupplierParty')[0]
             || root.getElementsByTagName('cac:AccountingSupplierParty')[0];
    const supParty = sup?.getElementsByTagNameNS(NS.cac, 'Party')[0] || sup?.getElementsByTagName('cac:Party')[0];
    const proveedor = get(supParty || root, NS.cbc, 'Name') || get(supParty || root, NS.cbc, 'RegistrationName');

    const cus = root.getElementsByTagNameNS(NS.cac, 'AccountingCustomerParty')[0]
             || root.getElementsByTagName('cac:AccountingCustomerParty')[0];
    const cusParty = cus?.getElementsByTagNameNS(NS.cac, 'Party')[0] || cus?.getElementsByTagName('cac:Party')[0];
    const cliente = get(cusParty || root, NS.cbc, 'Name') || get(cusParty || root, NS.cbc, 'RegistrationName');

    // NUEVO: leer tipo y número de identificación del comprador
    const idInfo = this.readPartyDocument(cusParty, NS);

    return {
      numero: numero || '',
      fecha: fecha || '',
      proveedor: proveedor || '',
      cliente: cliente || '',
      moneda: moneda || '',
      cufe: cufe || '',
      clienteTipoId: idInfo.tipo,
      clienteNumeroId: idInfo.numero
    };
  }

  private textFirst(nodes?: Iterable<Element> | ArrayLike<Element> | null): string {
    if (!nodes) return '';
    const arr = Array.from(nodes);
    if (!arr.length) return '';
    return (arr[0].textContent || '').trim();
  }

  private num(s: string): number {
    const t = s.replace(/\s/g, '').replace(/,/g, '.');
    const n = Number(t);
    return isFinite(n) ? n : 0;
  }

  private attr(el: Element | undefined | null, name: string): string {
    return el?.getAttribute(name)?.trim() || '';
  }

  private readPartyDocument(party: Element | undefined | null, NS: any): { tipo?: string; numero?: string } {
    if (!party) return {};

    const tax = party.getElementsByTagNameNS(NS.cac, 'PartyTaxScheme')[0]
             || party.getElementsByTagName('cac:PartyTaxScheme')[0];
    const companyIdEl = tax?.getElementsByTagNameNS(NS.cbc, 'CompanyID')[0]
                     || tax?.getElementsByTagName('cbc:CompanyID')[0]
                     || tax?.getElementsByTagName('CompanyID')[0];

    if (companyIdEl && (companyIdEl.textContent || '').trim()) {
      const numero = (companyIdEl.textContent || '').trim();
      const tipo = this.attr(companyIdEl, 'schemeName')
                 || this.attr(companyIdEl, 'schemeID')
                 || this.attr(companyIdEl, 'schemeAgencyName')
                 || 'NIT';
      return { tipo, numero };
    }

    const pid = party.getElementsByTagNameNS(NS.cac, 'PartyIdentification')[0]
             || party.getElementsByTagName('cac:PartyIdentification')[0];
    const idEl = pid?.getElementsByTagNameNS(NS.cbc, 'ID')[0]
              || pid?.getElementsByTagName('cbc:ID')[0]
              || pid?.getElementsByTagName('ID')[0];

    if (idEl && (idEl.textContent || '').trim()) {
      const numero = (idEl.textContent || '').trim();
      const tipo = this.attr(idEl, 'schemeName')
                 || this.attr(idEl, 'schemeID')
                 || this.attr(idEl, 'schemeAgencyName')
                 || '';
      return { tipo, numero };
    }

    return {};
  }


get clientePrincipal(): string {
  const nombre = this.encabezado?.cliente?.trim() || '';
  const tipo   = this.encabezado?.clienteTipoId?.trim() || '';
  const num    = this.encabezado?.clienteNumeroId?.trim() || '';

  const nombreValido = nombre && nombre.toLowerCase() !== 'no aplica';

  if (nombreValido) return nombre;

  if (num) return [tipo, num].filter(Boolean).join(' ');

  return '—';
}



tipoXmlSel: TipoXML = 'emitidos';
empresaSelId: string | null = null;
paquetesEmpresa: PaqueteResumen[] = [];
paquetesFiltrados: PaqueteResumen[] = [];
paqueteSelId: string | null = null;
pucCatalog: Array<{ id: string; codigo: string; nombre: string; tipo: PUCLinea['tipo']; naturaleza: PUCLinea['naturaleza']; }> = [];

paqueteSeleccionado: PUCLinea[] = [];


onEmpresaChange(empresaId: string | null) {
  console.log('[EMP][CHANGE]', empresaId);
  this.empresaSelId = empresaId;
  this.paqueteSelId = null;
  this.paqueteSeleccionado = [];
  this.paquetesFiltrados = [];
  this.paquetesEmpresa = [];

  if (!empresaId) return;

  this.cuentasSvc.listarPorEmpresa(empresaId).subscribe(pkts => {
    console.log('[EMP][PKTS RAW]', pkts);
    this.paquetesEmpresa = pkts ?? [];
    this.filtrarPaquetesPorTipo();
  });
}

private filtrarPaquetesPorTipo() {
  const t = (this.tipoXmlSel || '').toLowerCase();
  this.paquetesFiltrados = (this.paquetesEmpresa ?? []).filter(
    p => (String(p.descripcion || '').toLowerCase() as any) === t
  );
  console.log('[PKTS][FILTRADOS]', t, this.paquetesFiltrados);

  // Fallback opcional: si no hay del tipo, mostrar todos para que pruebes
  if (!this.paquetesFiltrados.length && this.paquetesEmpresa.length) {
    console.warn('[PKTS][FALLBACK] No hay del tipo, mostrando todos.');
    this.paquetesFiltrados = this.paquetesEmpresa;
  }
}


onTipoXmlChange(tipo: 'emitidos' | 'recibidos') {
  console.log('[TIPO][CHANGE]', tipo);
  this.tipoXmlSel = tipo;
  this.filtrarPaquetesPorTipo();

  const pkt = this.paquetesEmpresa.find(p => p.id === this.paqueteSelId);
  if (pkt && (String(pkt.descripcion || '').toLowerCase() as any) !== this.tipoXmlSel) {
    this.paqueteSelId = null;
    this.paqueteSeleccionado = [];
  }
}


onPaqueteChange(paqueteId: string | null) {
  this.paqueteSelId = paqueteId || null;
  if (!paqueteId) { this.paqueteSeleccionado = []; return; }

  const pkt = this.paquetesEmpresa.find(p => p.id === paqueteId);
  if (!pkt) { this.paqueteSeleccionado = []; return; }

  // ahora usamos tipo/naturaleza del backend
  this.paqueteSeleccionado = (pkt.cuentas ?? []).map(c => ({
    cuenta: c.codigo,
    tipo: c.tipo,
    naturaleza: c.naturaleza,
  }));

  console.log('[PKT][SELECCIONADO]', this.paqueteSeleccionado);
}


get clienteSecundario(): string {
  const nombre = this.encabezado?.cliente?.trim() || '';
  const nombreValido = nombre && nombre.toLowerCase() !== 'no aplica';
  if (!nombreValido) return ''; // si no hay nombre, no mostramos segunda línea

  const tipo = this.encabezado?.clienteTipoId?.trim() || '';
  const num  = this.encabezado?.clienteNumeroId?.trim() || '';
  const combo = [tipo, num].filter(Boolean).join(' ');
  return combo || '';
}


/*
onExportar() {
  if (!this.paqueteSeleccionado?.length) {
    alert('Primero selecciona un plan de cuentas (paquete).');
    return;
  }
  if (!this.docs?.length) {
    alert('Primero procesa al menos un XML.');
    return;
  }
  console.log('[EXPORT] docs:', this.docs.length, 'plan:', this.paqueteSeleccionado);
  this.contaExcel.exportContabilizacion(this.docs, this.paqueteSeleccionado, {
    tipoComprobante: 3,
    filename: `contabilizacion_${this.periodo}.xlsx`
  });
  if (this.tipo !== 'RECIBIDOS') return;
  this.mostrarSelectorImpuestoPara[this.selectedDocIndex] = true;
}*/

onExportar() {
  if (!this.paqueteSeleccionado?.length) {
    alert('Primero selecciona un plan de cuentas (paquete).');
    return;
  }
  if (!this.docs?.length) {
    alert('Primero procesa al menos un XML.');
    return;
  }

  console.log('[EXPORT] docs:', this.docs.length, 'plan:', this.paqueteSeleccionado);

  // ✅ Si es RECIBIDOS, llama su servicio y sal
  if (this.tipo === 'RECIBIDOS') {
    const docsRec = this.mapDocsToRecibidos(this.docs);
    this.contaRecibidos.exportRecibidos(docsRec, this.paqueteSeleccionado, {
      tipoComprobante: 4, // fijo para recibidos
      filename: `contabilizacion_recibidos_${this.periodo}.xlsx`,
      sortByDate: 'asc',
      autofillConsecutivo: true,
    });
    return;
  }

  // 🔵 Emitidos: tu flujo intacto
  this.contaExcel.exportContabilizacion(this.docs, this.paqueteSeleccionado, {
    tipoComprobante: 3,
    filename: `contabilizacion_${this.periodo}.xlsx`,
    sortByDate: 'asc',
    autofillConsecutivo: true,
  });

  
}



  mostrarSelectorImpuestoPara: Record<number, boolean> = {};

  impuestoSeleccionadoPara: Record<number, string|null> = {};

  impuestosAgrupados = [
    { grupo: 'ReteFuente', opciones: IMPUESTOS_2025.filter(i => i.grupo === 'ReteFuente') },
    { grupo: 'ReteIVA',    opciones: IMPUESTOS_2025.filter(i => i.grupo === 'ReteIVA') },
    { grupo: 'Otros',      opciones: IMPUESTOS_2025.filter(i => i.grupo === 'Otros') },
  ];


  onImpuestoSeleccionado(idx: number, codigo: string|null) {
    this.impuestoSeleccionadoPara[idx] = codigo;

  }
// Helper minúsculo: selección UI → código SIIGO
private siigoCodeFromSelection(sel?: string | null): string {
  if (!sel || sel === '' || sel === 'NA') return ''; // No aplica
  const map: Record<string, string> = {
    // ReteFuente
    RF_COMPRAS_DECL: '03', RF_COMPRAS_NO_DECL: '03', RF_SERVICIOS_DECL: '03',
    RF_SERVICIOS_NO_DECL: '03', RF_HON_PJ: '03', RF_HON_NO_DECL: '03',
    RF_ARR_MUEBLES: '03', RF_ARR_INMUEBLES: '03', RF_TRANSP_CARGA: '03',
    RF_HOTELES_REST: '03', RF_VIG_ASEO_AIU: '03', RF_SERV_TEMP_AIU: '03',
    RF_TARJETA_DB_CR: '03', RF_COMBUSTIBLE: '03',
    // ReteIVA
    RIVA_COMPRAS: '04', RIVA_SERVICIOS: '04',
    // IVA descontable explícito (si lo usas)
    IVA_DESCONTABLE: '02',
    // ReteICA (si lo usas)
    RETE_ICA: '05',
  };
  return map[sel] ?? '';
}

// Adaptador mínimo: agrega proveedor e impuesto al doc
private mapDocsToRecibidos(docs: any[]): any[] {
  return docs.map((d, i) => ({
    ...d,
    header: {
      ...d.header,
      proveedorNumeroId: d.header?.proveedorNumeroId ?? d.header?.clienteNumeroId ?? '',
    },
    impuestoCodigo: this.siigoCodeFromSelection(this.impuestoSeleccionadoPara?.[i]),
  }));
}

  
}
