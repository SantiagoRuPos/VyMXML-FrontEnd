import { Routes } from '@angular/router';
import { LoginComponent } from './public/login/login.component';
import { ResetPasswordComponent } from './public/reset-password/reset-password.component';
import { HomeComponent } from './private/home/home.component';

export const routes: Routes = [
  {path:'', redirectTo: 'login', pathMatch: 'full'},
  {path:'login',component:LoginComponent},
  {path:'reset-password',component:ResetPasswordComponent},
  {path:'home',component:HomeComponent},


];
