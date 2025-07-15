import {
  Component,
  ElementRef,
  AfterViewInit,
  ViewChild,
  QueryList,
  ViewChildren,
  Inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { gsap } from 'gsap';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
@Component({
  standalone: true,
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  imports: [FormsModule, CommonModule]
})
export class LoginComponent implements AfterViewInit {
  @ViewChild('loginCard', { static: true }) loginCard!: ElementRef<HTMLDivElement>;
  @ViewChildren('formGroup') formGroups!: QueryList<ElementRef>;
  @ViewChildren('error') error!: QueryList<ElementRef>;

  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  constructor(@Inject(PLATFORM_ID) private platformId: Object,private router: Router) {}

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        const tl = gsap.timeline();

        tl.from(this.loginCard.nativeElement, {
          opacity: 0,
          y: -50,
          duration: 0.8,
          ease: 'power3.out'
        });

        if (document.querySelector('.logo img')) {
          tl.from('.logo img', {
            opacity: 0,
            scale: 0.5,
            duration: 0.6,
            ease: 'back.out(1.7)'
          });
        }

        if (document.querySelector('h1')) {
          tl.from('h1', {
            opacity: 0,
            y: -20,
            duration: 0.4,
            ease: 'power2.out'
          });
        }

        if (document.querySelector('.subtitle')) {
          tl.from('.subtitle', {
            opacity: 0,
            y: -20,
            duration: 0.4,
            ease: 'power2.out'
          });
        }

        if (document.querySelectorAll('.form-group').length) {
          tl.from('.form-group', {
            opacity: 0,
            y: 20,
            duration: 0.4,
            stagger: 0.1,
            ease: 'power2.out'
          });
        }

        if (document.querySelector('button')) {
          tl.from('button', {
            opacity: 0,
            scale: 0.9,
            duration: 0.4,
            ease: 'elastic.out(1, 0.3)'
          });
        }

        if (document.querySelector('footer')) {
          tl.from('footer', {
            opacity: 0,
            y: 20,
            duration: 0.4,
            ease: 'power2.out'
          });
        }
      }, 0);
    }
  }

  onLogin() {
    this.loading = true;
    this.errorMessage = '';

    setTimeout(() => {
      if (this.email === 'admin@admin.com' && this.password === '123456') {
        this.loading = false;
        this.router.navigate(['/home']);
      } else {
        this.loading = false;
        this.errorMessage = 'Correo o contraseña incorrectos';

        if (isPlatformBrowser(this.platformId)) {
          const tlError = gsap.timeline();
          tlError
            .from('.error', {
              opacity: 0,
              y: -20,
              duration: 0.3
            })
            .to('.error', {
              y: 20,
              duration: 0.3,
              repeat: 2,
              yoyo: true
            });
        }
      }
    }, 1500);
  }
}
