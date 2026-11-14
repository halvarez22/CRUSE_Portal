/**
 * GENERADOR AUTOMATIZADO DE MANUALES OFICIALES (.MD, .HTML Y .PDF — FASE 1 Y FASE 3)
 * Expediente: CRUSE-APO-2026-064 (Sincronización Documental Post-Homologación APO-063)
 *
 * Cumple Guardrail Forense 4:
 * - Sincroniza y compila MANUAL_FASE1_PORTAL_WEB_SEGURO_CRUSE y MANUAL_FASE3_ECOSISTEMA_FINTECH_CRUSE
 *   en public/docs/, docs/ y C:\CRUSE_PORTAL\
 * - Verifica que cada PDF generado supere 500 KB (> 512,000 bytes)
 * - Tipado estricto TypeScript (0 any) y < 250 líneas
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function formatInlineMarkdown(line: string): string {
  return line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br/>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtmlBody(md: string): string {
  const lines = md.split(/\r?\n/);
  const htmlParts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inTable = false;

  const closeList = () => {
    if (inList) {
      htmlParts.push(`</${inList}>`);
      inList = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      htmlParts.push('</tbody></table>');
      inTable = false;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      closeList();
      closeTable();
      continue;
    }
    if (trimmed === '---') {
      closeList();
      closeTable();
      htmlParts.push('<hr/>');
      continue;
    }
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList();
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (!inTable) {
        inTable = true;
        htmlParts.push(`<table><thead><tr>${cells.map((c) => `<th>${formatInlineMarkdown(c)}</th>`).join('')}</tr></thead><tbody>`);
      } else {
        htmlParts.push(`<tr>${cells.map((c) => `<td>${formatInlineMarkdown(c)}</td>`).join('')}</tr>`);
      }
      continue;
    }
    closeTable();
    if (trimmed.startsWith('### ')) {
      closeList();
      htmlParts.push(`<h3>${formatInlineMarkdown(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      htmlParts.push(`<h2>${formatInlineMarkdown(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      htmlParts.push(`<h1>${formatInlineMarkdown(trimmed.slice(2))}</h1>`);
      continue;
    }
    const ulMatch = /^-\s+(.*)$/.exec(trimmed);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        htmlParts.push('<ul>');
      }
      htmlParts.push(`<li>${formatInlineMarkdown(ulMatch[1] ?? '')}</li>`);
      continue;
    }
    const olMatch = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        htmlParts.push('<ol>');
      }
      htmlParts.push(`<li>${formatInlineMarkdown(olMatch[1] ?? '')}</li>`);
      continue;
    }
    closeList();
    htmlParts.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  }
  closeList();
  closeTable();
  return htmlParts.join('\n');
}

function buildInstitutionalHtml(bodyHtml: string, title: string, subtitle: string, badge: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none';">
  <title>${title}</title>
  <style>
    @page { size: letter; margin: 16mm; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; line-height: 1.55; max-width: 960px; margin: 0 auto; padding: 24px; background: #ffffff; }
    .seal-banner { border: 2px solid #0D1B3E; background: linear-gradient(90deg, #0D1B3E 0%, #162c63 100%); color: #ffffff; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .seal-banner .title { font-size: 14px; font-weight: 700; color: #00D1FF; }
    .seal-banner .subtitle { font-size: 11px; color: #e2e8f0; }
    .seal-badge { background: #D4AF37; color: #0D1B3E; font-weight: 800; font-size: 11px; padding: 6px 12px; border-radius: 6px; text-transform: uppercase; }
    h1 { color: #0D1B3E; border-bottom: 3px solid #00D1FF; padding-bottom: 10px; font-size: 22px; margin-top: 28px; }
    h2 { color: #0D1B3E; background: #f1f5f9; border-left: 5px solid #0D1B3E; padding: 8px 12px; margin-top: 24px; font-size: 17px; page-break-after: avoid; }
    h3 { color: #1e3a8a; margin-top: 16px; font-size: 14.5px; page-break-after: avoid; }
    p, li { font-size: 13px; }
    code { background: #e2e8f0; padding: 1.5px 5px; border-radius: 4px; font-family: Consolas, monospace; font-size: 12px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; page-break-inside: auto; }
    tr { page-break-inside: avoid; }
    th { background: #0D1B3E; color: #ffffff; text-align: left; padding: 8px 10px; border: 1px solid #cbd5e1; }
    td { padding: 7px 10px; border: 1px solid #cbd5e1; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="seal-banner">
    <div>
      <div class="title">MICROFINANCIERA CRUSE, S.A. DE C.V., SOFOM, E.N.R. • RFC: MCR1002231B7</div>
      <div class="subtitle">${subtitle}</div>
    </div>
    <div class="seal-badge">${badge}</div>
  </div>
${bodyHtml}
</body>
</html>`;
}

function findEdgeBinary(): string {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('No se encontró navegador para exportar PDF.');
}

interface ManualBuildSpec {
  baseName: string;
  sourceMdPath: string;
  title: string;
  subtitle: string;
  badge: string;
  syncTrainingAlias?: boolean;
}

async function main(): Promise<void> {
  const appDir = process.cwd();
  const rootDir = path.resolve(appDir, '..');
  const publicDocsDir = path.join(appDir, 'public', 'docs');
  const docsDir = path.join(appDir, 'docs');
  const browserBin = findEdgeBinary();

  const specs: ManualBuildSpec[] = [
    {
      baseName: 'MANUAL_FASE1_PORTAL_WEB_SEGURO_CRUSE',
      sourceMdPath: path.join(publicDocsDir, 'MANUAL_FASE1_PORTAL_WEB_SEGURO_CRUSE.md'),
      title: 'Manual Oficial de Usuario, Administración y Entrenamiento (Fase 1) — CRUSE Fintech Portal',
      subtitle: 'Documento Oficial Fase 1 Homologado (CRUSE-APO-2026-063 / 064) • 2FA SMS • Base 365/30.4 • 3 Regímenes IVA',
      badge: 'FASE 1 CERTIFICADA',
      syncTrainingAlias: true,
    },
    {
      baseName: 'MANUAL_FASE3_ECOSISTEMA_FINTECH_CRUSE',
      sourceMdPath: path.join(publicDocsDir, 'MANUAL_FASE3_ECOSISTEMA_FINTECH_CRUSE.md'),
      title: 'Manual Oficial de Usuario, Operación Digital y Entrenamiento (Fase 3) — CRUSE Fintech Portal',
      subtitle: 'Documento Oficial Fase 3 Homologado (CRUSE-APO-2026-063 / 064) • App Cruse • NOM-151 + Anexo 1 • Migración Nube & Rollback',
      badge: 'FASE 3 CERTIFICADA',
    },
  ];

  for (const spec of specs) {
    const mdContent = fs.readFileSync(spec.sourceMdPath, 'utf-8');
    const htmlContent = buildInstitutionalHtml(markdownToHtmlBody(mdContent), spec.title, spec.subtitle, spec.badge);

    const publicHtmlPath = path.join(publicDocsDir, `${spec.baseName}.html`);
    const publicPdfPath = path.join(publicDocsDir, `${spec.baseName}.pdf`);
    fs.writeFileSync(publicHtmlPath, htmlContent, 'utf-8');

    execFileSync(browserBin, [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${publicPdfPath}`,
      publicHtmlPath,
    ]);

    const pdfSize = fs.statSync(publicPdfPath).size;
    const htmlSize = fs.statSync(publicHtmlPath).size;
    if (pdfSize < 500_000) {
      throw new Error(`Guardrail 4 violado: ${spec.baseName}.pdf pesa ${pdfSize}B (< 500 KB).`);
    }

    // Sincronizar espejos en C:\CRUSE_PORTAL\ y docs/
    fs.copyFileSync(spec.sourceMdPath, path.join(rootDir, `${spec.baseName}.md`));
    fs.copyFileSync(publicHtmlPath, path.join(rootDir, `${spec.baseName}.html`));
    fs.copyFileSync(publicPdfPath, path.join(rootDir, `${spec.baseName}.pdf`));

    if (spec.baseName === 'MANUAL_FASE3_ECOSISTEMA_FINTECH_CRUSE') {
      fs.copyFileSync(spec.sourceMdPath, path.join(docsDir, `${spec.baseName}.md`));
    }

    if (spec.syncTrainingAlias) {
      fs.copyFileSync(spec.sourceMdPath, path.join(docsDir, 'MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md'));
      fs.copyFileSync(spec.sourceMdPath, path.join(rootDir, 'MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.md'));
      fs.copyFileSync(publicHtmlPath, path.join(rootDir, 'MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.html'));
      fs.copyFileSync(publicPdfPath, path.join(rootDir, 'MANUAL_USUARIO_ENTRENAMIENTO_CRUSE_PORTAL.pdf'));
    }

    console.log(`[APO-064] ${spec.baseName} regenerado: MD=${mdContent.length}B, HTML=${htmlSize}B, PDF=${pdfSize}B (>500KB OK)`);
  }
}

main().catch((err: unknown) => {
  console.error('Error en generateManualPdf:', err);
  process.exit(1);
});
