import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FacturaService {
  private facturaSubject = new BehaviorSubject<any>(null);

  setFactura(data: any) {
    this.facturaSubject.next(data);
  }

  getFactura() {
    return this.facturaSubject.asObservable();
  }
}
