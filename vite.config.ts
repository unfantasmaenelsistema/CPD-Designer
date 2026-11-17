import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Base relativa: funciona en GitHub Pages (/CPD-Designer/) y en cualquier subcarpeta.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
