import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// The PAT lives in localStorage, so lock the page down in production builds.
// Dev is excluded: Vite HMR needs inline scripts the policy would reject.
const CSP =
  "default-src 'self'; " +
  "connect-src 'self' https://api.github.com; " +
  "img-src https: data:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; " +
  "object-src 'none'; base-uri 'self'";

function cspOnBuild(): Plugin {
  let isBuild = false;
  return {
    name: 'learntree-csp',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml(html) {
      if (!isBuild) return html;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Relative base + hash routing: the same build works at any deploy path
  // (github.io/<repo>/, a custom domain, or file previews).
  base: './',
  plugins: [react(), tailwindcss(), cspOnBuild()],
});
