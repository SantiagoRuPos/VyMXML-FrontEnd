import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FacturaService } from '../services/facturas.service';
import { inject } from '@angular/core';

@Component({
  selector: 'app-menu',
  imports: [CommonModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css',
  standalone: true,
})
export class MenuComponent {
  empresasOpen = false;
  userOpen = false;
  mobileMenuOpen = false;
  facturaService = inject(FacturaService);



  toggleEmpresasDropdown() {
    this.empresasOpen = !this.empresasOpen;
    if (this.empresasOpen) {
      this.userOpen = false;
    }
  }

  toggleUserDropdown() {
    this.userOpen = !this.userOpen;
    if (this.userOpen) {
      this.empresasOpen = false;
    }
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (!this.mobileMenuOpen) {
      this.closeAllDropdowns();
    }
  }

  closeMobile() {
    this.mobileMenuOpen = false;
    this.closeAllDropdowns();
  }

  closeAllDropdowns() {
    this.empresasOpen = false;
    this.userOpen = false;
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: Event) {
    const target = event.target as HTMLElement;
    if (!target.closest('.navbar')) {
      this.closeAllDropdowns();
      this.mobileMenuOpen = false;
    }
  }

  logout() {
    console.log('Cerrar sesión');
    this.closeMobile();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      console.log('Archivo seleccionado:', file.name);

      const reader = new FileReader();

      reader.onload = () => {
        const xmlString = reader.result as string;
        console.log('Contenido XML leído:', xmlString);
        this.parseXML(xmlString);
      };

      reader.readAsText(file);
    }
  }

  parseXML(xmlString: string) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const nsCBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
    const nsCAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';

    const invoiceNumber = xmlDoc.getElementsByTagNameNS(nsCBC, 'ID')[0]?.textContent || '';
    const issueDate = xmlDoc.getElementsByTagNameNS(nsCBC, 'IssueDate')[0]?.textContent || '';
    const issueTime = xmlDoc.getElementsByTagNameNS(nsCBC, 'IssueTime')[0]?.textContent || '';

    const supplierParty = xmlDoc.getElementsByTagNameNS(nsCAC, 'AccountingSupplierParty')[0];
    const supplierName = supplierParty?.getElementsByTagNameNS(nsCBC, 'RegistrationName')[0]?.textContent || '';
    const supplierNIT = supplierParty?.getElementsByTagNameNS(nsCBC, 'CompanyID')[0]?.textContent || '';

    const customerParty = xmlDoc.getElementsByTagNameNS(nsCAC, 'AccountingCustomerParty')[0];
    const customerName = customerParty?.getElementsByTagNameNS(nsCBC, 'RegistrationName')[0]?.textContent || '';
    const customerNIT = customerParty?.getElementsByTagNameNS(nsCBC, 'CompanyID')[0]?.textContent || '';

    const monetaryTotal = xmlDoc.getElementsByTagNameNS(nsCAC, 'LegalMonetaryTotal')[0];
    const totalAmount = monetaryTotal?.getElementsByTagNameNS(nsCBC, 'PayableAmount')[0]?.textContent || '';

    const taxTotal = xmlDoc.getElementsByTagNameNS(nsCAC, 'TaxTotal')[0];
    const totalIVA = taxTotal?.getElementsByTagNameNS(nsCBC, 'TaxAmount')[0]?.textContent || '';

    const items: any[] = [];
    const lines = xmlDoc.getElementsByTagNameNS(nsCAC, 'InvoiceLine');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const description = line.getElementsByTagNameNS(nsCBC, 'Description')[0]?.textContent || '';
      const quantity = line.getElementsByTagNameNS(nsCBC, 'InvoicedQuantity')[0]?.textContent || '';
      const unitPrice = line.getElementsByTagNameNS(nsCBC, 'PriceAmount')[0]?.textContent || '';
      const totalLine = line.getElementsByTagNameNS(nsCBC, 'LineExtensionAmount')[0]?.textContent || '';

      items.push({
        description,
        quantity,
        unitPrice,
        totalLine
      });
    }

    const factura = {
      invoiceNumber,
      issueDate,
      issueTime,
      supplierName,
      supplierNIT,
      customerName,
      customerNIT,
      totalAmount,
      totalIVA,
      items
    };

    console.log('✅ Factura parseada:', factura);

    this.facturaService.setFactura(factura);
  }
}


