import { defineConfig } from 'vite';
import baseConfig from './vite.config';

export default defineConfig({
    ...baseConfig,
    base: './', // Electron requires relative paths for file:// protocol
});
