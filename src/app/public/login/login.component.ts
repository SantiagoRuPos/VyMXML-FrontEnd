import { Component, inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

interface MockUser {
  email: string;
  password: string;
  estado: 'ACTIVO' | 'INACTIVO';
  nombre: string;
}
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  // ... tus signals:
  email = signal<string>('');
  password = signal<string>('');
  remember = signal<boolean>(false);
  showPass = signal<boolean>(false);
  currentYear = new Date().getFullYear();
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  // inyecciones
  private auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Prefill de “Recordarme” (SSR-safe)
    if (this.isBrowser) {
      const remembered = localStorage.getItem('vm_remember_email');
      if (remembered) this.email.set(remembered);
    }
  }

  toggleShow() { this.showPass.update(v => !v); }

  onSubmit(e: Event) {
    e.preventDefault();
    this.errorMsg.set(null);

    const correo = this.email().trim().toLowerCase();
    const contrasena = this.password();

    if (!correo || !contrasena) {
      this.errorMsg.set('Ingresa correo y contraseña.');
      return;
    }

    this.loading.set(true);

    this.auth.login({ correo, contrasena })
      .subscribe({
        next: () => {
          // Recordarme (SSR-safe)
          if (this.isBrowser) {
            if (this.remember()) localStorage.setItem('vm_remember_email', correo);
            else localStorage.removeItem('vm_remember_email');
          }
          this.loading.set(false);
          this.router.navigateByUrl('/home');
        },
        error: (err) => {
          this.loading.set(false);
          const msg = err?.status === 401
            ? 'Credenciales inválidas.'
            : (err?.error?.message || 'No se pudo iniciar sesión.');
          this.errorMsg.set(msg);
        }
      });
  }
  
}
