import { Component } from '@angular/core';
import { MenuComponent } from "../menu/menu.component";
import {  OnInit } from '@angular/core';
import { FacturaService } from '../services/facturas.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-home',
  imports: [MenuComponent, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  facturaData: any = null;

  constructor(private facturaService: FacturaService) {}

  ngOnInit(): void {
    this.facturaService.getFactura().subscribe((data) => {
      this.facturaData = data;
      console.log('Factura en HomeComponent:', this.facturaData);
    });
  }
}
