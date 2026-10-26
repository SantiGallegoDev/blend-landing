/// <reference types="astro/client" />

declare global {
  namespace App {
    interface Locals {
      user: import('./lib/auth').Session['user'] | null;
      session: import('./lib/auth').Session['session'] | null;
    }
  }
}

export {};
