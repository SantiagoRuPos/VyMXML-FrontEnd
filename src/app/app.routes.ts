import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { HomeComponent } from './private/home/home.component';
import { EmpresasComponent } from './private/empresas/empresas.component';
import { CuentasComponent } from './private/cuentas/cuentas.component';
export const routes: Routes = [
{path: '', component:LoginComponent},
{path: 'Login', component:LoginComponent},

//Rutas privadas
{path: 'home',component:HomeComponent},
{path: 'empresas',component:EmpresasComponent},
{path: 'cuentas',component:CuentasComponent}
];
