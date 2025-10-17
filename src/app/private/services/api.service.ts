// src/app/core/services/empresas.service.ts
import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Empresa } from '../../core/models/empresas.model';
import { Observable } from 'rxjs';
import { API_URL } from '../../core/config/api-url.token';


export interface CrearEmpresaDto {
  nombre: string;
  nit: string;
}

export interface EstadoRef {
  id: string;
  codigo: string;
  nombre?: string;
}



@Injectable({ providedIn: 'root' })
export class EmpresasService {
  private api = inject(API_URL);
  
  private readonly base = `${this.api}`;
  
  constructor(private http: HttpClient) { }
  
  getEmpresas(): Observable<Empresa[]> {
    return this.http.get<Empresa[]>(`${this.base}/empresas/listar`);
  }
  crear(dto: CrearEmpresaDto) {
    return this.http.post<Empresa>(`${this.base}/empresas/crear`, dto);
  }




}
