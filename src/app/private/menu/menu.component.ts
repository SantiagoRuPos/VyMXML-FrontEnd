import { Component, ElementRef, HostListener, ViewChild, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../public/services/auth.service';
@Component({
  selector: 'app-menu',
  imports: [CommonModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.scss'
})
export class MenuComponent {
  private menuOpen = false;
  empresasOpen = false;

  @Input() fullName: string = '';
  @Input() email: string = '';
  initials: string = 'U';

  @ViewChild('btn',   { read: ElementRef }) btnRef!: ElementRef<HTMLButtonElement>;
  @ViewChild('panel', { read: ElementRef }) panelRef!: ElementRef<HTMLDivElement>;

  constructor(private router: Router, private hostEl: ElementRef, private auth: AuthService) {}

  ngOnInit(): void {
    const source = this.fullName?.trim() || this.email?.trim();
    if (source) this.initials = this.computeInitials(source);

    const u = this.auth.getUserSnapshot();
    if (u) {
      if (!this.fullName) this.fullName = u.nombreCompleto || '';
      if (!this.email)    this.email    = u.correo || '';
    }
      // 2) si sigue faltando email, toma del payload del token
      if (!this.email) {
        const payload = this.auth.decodeTokenPayload(); // { sub, correo, role, ... }
        if (payload?.correo) this.email = payload.correo;
      }
  
      // 3) calcula iniciales
      this.initials = this.computeInitials(this.fullName || this.email || 'U');
  }

  private computeInitials(source: string): string {
    const base = source.includes('@') ? source.split('@')[0] : source;
    const parts = base.replace(/[_.\-]+/g, ' ').trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  toggle(): void {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) this.empresasOpen = false;
  }

  open(): boolean {
    return this.menuOpen;
  }

  panelTop(): number {
    if (!this.btnRef) return 0;
    const btnRect = this.btnRef.nativeElement.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    return Math.round(btnRect.bottom + scrollY + 8);
  }

  panelRight(): number {
    if (!this.btnRef) return 0;
    const btnRect = this.btnRef.nativeElement.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const right = Math.round(viewportWidth - btnRect.right);
    return right + 0;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const target = e.target as Node;
    if (this.menuOpen) {
      const clickedBtn   = this.btnRef?.nativeElement.contains(target);
      const clickedPanel = this.panelRef?.nativeElement?.contains(target);
      if (!clickedBtn && !clickedPanel) this.menuOpen = false;
    }
    if (this.empresasOpen) {
      const clickedInsideHost = this.hostEl.nativeElement.contains(target);
      if (!clickedInsideHost) this.empresasOpen = false;
    }
  }

  @HostListener('window:keydown.escape')
  onEsc() {
    this.menuOpen = false;
    this.empresasOpen = false;
  }

  @HostListener('window:resize')
  onResize() {
    if (this.menuOpen) {}
  }

  toggleEmpresas(): void {
    this.empresasOpen = !this.empresasOpen;
    if (this.empresasOpen) this.menuOpen = false;
  }
  goPerfil(): void {
    this.menuOpen = false;
    this.router.navigate(['/home']);
  }
  
  logout(): void {
    this.auth.logout({
      clearRemember: false,                 // pon true si quieres borrar vm_remember_email
      extraKeys: ['filtros_informes', 'cache_dashboard'] // opcional
    });
    this.router.navigateByUrl('/Login');
  }
  goCuentas(): void {
    this.router.navigate(['/cuentas']);
  }

  goHistorial(): void {
    this.router.navigate(['/historial']);
  }

  goEmpresas(): void {
    this.menuOpen = false;
    this.router.navigate(['/empresas']);
  }

  goEmpresaCrear(): void {
    this.empresasOpen = false;
    this.router.navigate(['/empresa/crear']);
  }

  goEmpresaRegistrar(): void {
    this.empresasOpen = false;
    this.router.navigate(['/empresa/registrar']);
  }

  goEmpresaVer(): void {
    this.empresasOpen = false;
    this.router.navigate(['/empresa/ver']);
  }  

}