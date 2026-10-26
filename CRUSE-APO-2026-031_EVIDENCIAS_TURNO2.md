# 🏛️ EXPEDIENTE DE EVIDENCIA FORENSE — CRUSE-APO-2026-031 (TURNO 2)

**Proyecto:** Portal Web Seguro & Ecosistema Fintech — Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.  
**Expediente:** `CRUSE-APO-2026-031` (Corrección Crítica de Contraste y Legibilidad en Modo Claro — WCAG AA/AAA)  
**Para:** Qwen, Auditor Senior Forense de Software & Ing. Gerardo Ornelas  
**De:** Equipo de Desarrollo "Antigravity"  
**Fecha:** 26 de octubre de 2026  

---

## 🔒 GUARDRAIL 1: Corrección Mecánica Obligatoria en Tailwind CSS v4 y Tokens Semánticos (`src/index.css`)

### 1.1 Primeras 64 Líneas de `src/index.css` (`@custom-variant dark` + Variables Semánticas `:root`, `.light`, `.dark`)
```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

/* ==============================================================================
   SISTEMA SEMÁNTICO DE TOKENS DE COLOR Y CONTRASTE WCAG AA/AAA (CRUSE-APO-2026-031)
   ============================================================================== */

:root,
.light,
[data-theme="light"] {
  --bg-primary: #F8FAFC;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F1F5F9;
  --bg-elevated: #FFFFFF;

  --text-primary: #0F172A;
  --text-secondary: #334155;
  --text-tertiary: #64748B;
  --text-inverse: #FFFFFF;

  --border-default: #E2E8F0;
  --border-strong: #CBD5E1;

  --accent-primary: #249E82;
  --accent-secondary: #396CAE;
  --accent-success: #059669;
  --accent-warning: #D97706;
  --accent-danger: #DC2626;

  --shadow-sm: 0 1px 2px 0 rgb(15 23 42 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06);
  --shadow-lg: 0 10px 25px -3px rgb(15 23 42 / 0.08), 0 4px 6px -4px rgb(15 23 42 / 0.05);

  color-scheme: light;
}

.dark,
[data-theme="dark"] {
  --bg-primary: #030914;
  --bg-secondary: rgba(4, 23, 52, 0.72);
  --bg-tertiary: rgba(15, 23, 42, 0.85);
  --bg-elevated: rgba(4, 23, 52, 0.88);

  --text-primary: #F8FAFC;
  --text-secondary: #CBD5E1;
  --text-tertiary: #94A3B8;
  --text-inverse: #0F172A;

  --border-default: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.22);

  --accent-primary: #249E82;
  --accent-secondary: #00D1FF;
  --accent-success: #4CD360;
  --accent-warning: #F59E0B;
  --accent-danger: #EF4444;

  --shadow-sm: 0 2px 8px 0 rgba(0, 0, 0, 0.35);
  --shadow-md: 0 8px 24px 0 rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 16px 40px 0 rgba(0, 0, 0, 0.55);

  color-scheme: dark;
}
```

---

## 🔒 GUARDRAIL 2: Cumplimiento Estricto de Contraste WCAG AA/AAA (4.5:1 Mínimo) en Componentes Críticos

### 2.1 Snippet 1 — `src/components/public/HeroPedestalSection.tsx` (Título, Subtítulo, 4 Cards de Beneficios y Botones)
```tsx
          {/* Main Title (Slide 1 Typography — Contraste WCAG AAA en Modo Claro) */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white max-w-4xl leading-tight mb-4">
            Ecosistema Operativo Cruse
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-700 dark:text-slate-300 max-w-3xl leading-relaxed mb-8">
            {COMPANY_INFO.tagline}. Créditos de nómina directos para empleados en activo, jubilados y pensionados del{' '}
            <strong className="text-slate-900 dark:text-white font-bold">Gobierno del Estado de Chihuahua</strong> y del{' '}
            <strong className="text-slate-900 dark:text-white font-bold">Supremo Tribunal de Justicia</strong>.
          </p>

          {/* 4 Feature Cards (Pillars — Guardrail 2: Contraste WCAG AA/AAA en Modo Claro, intacto en Modo Oscuro) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-4xl mb-10">
            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-emerald-500/30 shadow-sm">
              <span className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-[#4CD360] font-mono block">
                0%
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Comisión por Apertura
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Recibes el 100% de tu préstamo
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-blue-500/30 shadow-sm">
              <span className="text-2xl sm:text-3xl font-black text-[#1E40AF] dark:text-[#00D1FF] font-mono block">
                1.97%
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Tasa Quincenal Fija
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Sin variaciones ni sorpresas
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-teal-500/30 shadow-sm">
              <span className="text-xl sm:text-2xl font-black text-teal-800 dark:text-[#249E82] block">
                Sin Aval
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Garantía en Nómina
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Descuento quincenal automático
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 text-center border border-slate-200 dark:border-purple-500/30 shadow-sm">
              <span className="text-xl sm:text-2xl font-black text-purple-800 dark:text-purple-300 block">
                Sin Buró
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200 block mt-0.5">
                Capacidad Real de Pago
              </span>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 block mt-0.5">
                Evaluamos tu estabilidad laboral
              </span>
            </div>
          </div>
```

### 2.2 Snippet 2 — `src/components/auth/Login2FAModal.tsx` (Teléfono Enmascarado, Botón Reenviar y Enlace de Código de Respaldo)
```tsx
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                    {userName} ({userRole.replace('_', ' ').toUpperCase()})
                  </p>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300">
                    Se envió un código SMS de 6 dígitos a tu celular registrado:{' '}
                    <span className="font-mono font-bold text-cyan-700 dark:text-[#00D1FF]">{maskedPhone}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={resendingSms || resendCooldown > 0}
                onClick={handleResendSms}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 text-[11px] font-semibold text-cyan-700 dark:text-[#00D1FF] border border-cyan-600/40 dark:border-[#00D1FF]/30 disabled:opacity-50 inline-flex items-center gap-1 shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${resendingSms ? 'animate-spin' : ''}`} />
                <span>{resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar SMS'}</span>
              </button>
...
                <button
                  type="button"
                  onClick={() => {
                    setUseRecoveryMode((prev) => !prev);
                    setTotpCode('');
                  }}
                  className="text-[11px] font-semibold text-cyan-700 dark:text-[#00D1FF] hover:underline"
                >
                  {useRecoveryMode ? 'Usar código SMS (6 dígitos)' : '¿No recibiste el SMS? Usa tu código de respaldo'}
                </button>
```

### 2.3 Snippet 3 — `src/components/common/HeaderNavbar.tsx` (Navegación y Contenedor de Logo con Contraste AAA)
```tsx
  return (
    <header className="fixed w-full top-0 z-50 glass-panel border-b border-slate-200 dark:border-white/10 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo Oficial de Cruse con Contenedor de Alto Contraste */}
          <a href="#" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82] rounded-xl p-1">
            <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm border border-slate-200 flex items-center justify-center transition-transform group-hover:scale-105">
              <img
                src="/branding/logotipo-cruse-oficial.png"
                alt="Microfinanciera Cruse SOFOM E.N.R."
                className="h-9 w-auto object-contain"
              />
            </div>
            <div className="hidden sm:block border-l border-slate-300 dark:border-white/20 pl-3">
              <span className="text-[11px] uppercase tracking-widest text-emerald-700 dark:text-[#249E82] font-black block">
                SOFOM E.N.R.
              </span>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Crédito de Nómina Gubernamental
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="px-3 py-2 rounded-lg text-xs lg:text-sm font-semibold text-slate-800 hover:text-emerald-700 hover:bg-slate-100/80 dark:text-slate-200 dark:hover:text-[#4CD360] dark:hover:bg-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#249E82]"
              >
                {link.name}
              </a>
            ))}
          </nav>
```

---

## 🔒 GUARDRAIL 3: Atenuación Controlada de Efectos Visuales (Glows/Orbes) en Modo Claro

### 3.1 Snippet de `src/App.tsx` (Líneas 140–143)
```tsx
      {/* Background Ambient Glowing Orbs (Neutralizados en Modo Claro conforme a Guardrail 3; intactos en Modo Oscuro) */}
      <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[#041734] opacity-0 dark:opacity-60 blur-[130px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed top-[25%] right-[-10%] w-[550px] h-[550px] rounded-full bg-[#1E9F81] opacity-0 dark:opacity-20 blur-[150px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-[#396CAE] opacity-0 dark:opacity-25 blur-[160px] pointer-events-none -z-10 gpu-accelerated" />
```

### 3.2 Snippet de `src/components/public/HeroPedestalSection.tsx` (Líneas 24–42)
```tsx
          {/* 3D Glass Pedestal Graphic Simulation */}
          <div className="relative mb-8 group">
            {/* Ambient pedestal glow (Solo en Modo Oscuro conforme a Guardrail 3) */}
            <div className="absolute -inset-4 bg-gradient-to-r from-[#249E82] via-[#00D1FF] to-[#396CAE] opacity-0 dark:opacity-30 blur-2xl rounded-full dark:group-hover:opacity-50 transition-opacity" />

            {/* The Frosted Glass Pedestal Slab */}
            <div className="relative w-56 sm:w-72 h-28 sm:h-36 rounded-2xl bg-slate-50 dark:bg-transparent glass-slab-emerald flex items-center justify-center p-4 border border-slate-200 dark:border-[#249E82]/50 shadow-md dark:shadow-2xl transform hover:-translate-y-1 transition-transform">
              <div className="bg-white rounded-xl px-4 py-2 shadow-sm dark:shadow-xl border border-slate-200 flex items-center justify-center">
                <img
                  src="/branding/logotipo-cruse-oficial.png"
                  alt="Cruse Microfinanciera"
                  className="h-10 sm:h-12 w-auto object-contain"
                />
              </div>
            </div>

            {/* Bottom pedestal reflection rim (Atenuado en Modo Claro) */}
            <div className="w-48 sm:w-60 h-3 bg-gradient-to-r from-transparent via-[#4CD360]/60 to-transparent mx-auto blur-xs -mt-1 opacity-0 dark:opacity-100" />
          </div>
```

---

## 🔒 GUARDRAIL 4: Certificación de Compilación (`tsc` + `build`) y Declaración Firmada de Cero Alteración en Modo Oscuro

### 4.1 Verificación de Tipos y Build de Producción
- `npx tsc --noEmit` → **`TSC_EXIT=0`** (0 errores de compilación).
- `npm run build` → **`BUILD_EXIT=0`** (`dist/index.html`, `dist/assets/*`, `dist/server.cjs` compilados exitosamente).

### 4.2 Declaración Firmada de Revisión Visual Cruzada (Modo Oscuro 100% Intacto)
> **DECLARACIÓN DE INTEGRIDAD VISUAL (GUARDRAIL 4):**  
> Por la presente certificamos que se ha realizado la revisión visual y de código cruzada entre el Modo Claro (`html.light` / `[data-theme="light"]`) y el Modo Oscuro (`html.dark` / `[data-theme="dark"]`). Todas las reglas CSS `.dark .glass-*` en `src/index.css` y todas las utilidades `dark:*` (`dark:bg-[#030914]`, `dark:text-white`, `dark:text-slate-200`, `dark:text-[#4CD360]`, `dark:text-[#00D1FF]`, `dark:opacity-60`, etc.) en los componentes permanecen **100% idénticas en sus valores originales**, garantizando que el Modo Oscuro conserva su estética original intacta mientras el Modo Claro opera con contraste ejecutivo WCAG AA/AAA.
>
> *Firmado:* **Equipo de Desarrollo Antigravity — 26 de octubre de 2026**
