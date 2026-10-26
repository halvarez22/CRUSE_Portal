# 🏛️ Portal Web Seguro & Ecosistema Fintech — Microfinanciera Cruse

**Cliente:** Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R. (Chihuahua, Chih.)  
**Plataforma:** Portal Web Seguro Integral, PWA Móvil & Core Operativo Financiero  
**Versión:** 2.0.0 (Entrega Definitiva — Fases 1 a 5 Concluidas)  
**Marco Normativo & Regulatorio:** CNBV (Art. 95 Bis LGOAAC PLD/FT), CONDUSEF (SIPRES / UNE), ASOFOM y LFPDPPP  

---

## 1. DESCRIPCIÓN EJECUTIVA DEL ECOSISTEMA

El **Portal Web Seguro de Microfinanciera Cruse** es la solución tecnológica integral que moderniza, escala y blinda legal y operativamente las operaciones de crédito con descuento vía nómina gubernamental e institucional (Convenios con el **Sindicato de Trabajadores al Servicio del Gobierno del Estado de Chihuahua — STSGECH** y el **Supremo Tribunal de Justicia del Estado de Chihuahua**).

La plataforma sustituye definitivamente el uso no auditable de hojas de cálculo de Excel, carpetas compartidas y canales informales mediante una arquitectura de grado bancario dividida en dos grandes dominios:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      ECOSISTEMA INTEGRAL CRUSE FINTECH PORTAL                          │
├──────────────────────────────────────────┬─────────────────────────────────────────────┤
│      ZONA PÚBLICA (INSTITUCIONAL & B2C)  │     ZONA PRIVADA (CUMPLIMIENTO & OPERACIÓN) │
├──────────────────────────────────────────┼─────────────────────────────────────────────┤
│ • Oferta de Crédito Nómina (0% apertura) │ • Autenticación 2FA vía SMS al Celular      │
│ • Simulador Amortizaciones (decimal.js)  │ • Escáner Móvil PWA con Canvas Analyzer     │
│ • Asistente IA 24/7 (Groq Zero-PII)      │ • Purga Zero-PII en Celular (Post-Ack)      │
│ • Transparencia CONDUSEF / SIPRES / UNE  │ • Base de Datos Relacional + WORM Nativo    │
│ • Selector Dinámico de Tema (Dark/Light) │ • Motor Conciliación Quincenal (4 Estados)  │
│ • Hubs: Chihuahua, León, Cancún          │ • Layouts SIF / CIB para Logic Systems      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. PILARES TÉCNICOS Y FASES ENTREGADAS

### ✅ Fase 1: Portal Público & Experiencia de Usuario (Certificado CRUSE-APO-2026-001)
- **Aritmética Bancaria Libre de Drift:** Motor de amortización construido sobre `decimal.js` con redondeo estricto `ROUND_HALF_UP` en cada iteración quincenal ($569.44 para $10k a 24q; CAT 88.05% y $22.85 de seguro de vida).
- **Asistente Virtual Zero-PII:** Integración con Groq SDK (LLaMA 3.3 70B Versatile) blindada con filtro preemptivo de expresiones regulares que bloquea CURP, RFC, correos y teléfonos bajo la LFPDPPP.
- **Identidad Visual Corporativa:** Glassmorphism en paleta Cruse (Azul Marino `#0D1B3E`, Cyan `#00D1FF`, Esmeralda `#249E82`, Dorado `#D4AF37`) con soporte total para modo Claro y Oscuro.

### ✅ Fase 2: Ciberseguridad, Criptografía & PWA de Promotores (Certificado CRUSE-APO-2026-002 / 030)
- **Autenticación Fuerte de Dos Factores (2FA vía SMS al Móvil Registrado):** Envío de código OTP de 6 dígitos por mensaje SMS directo al teléfono celular registrado de cada usuario (Twilio Verify v2) sin instalar aplicaciones externas, con Rate Limiting anti-abuso y 8 códigos de emergencia de un solo uso.
- **Envelope Encryption (AES-GCM 256 bits):** Cifrado en reposo para identificaciones y expedientes con separación de llaves KEK/DEK.
- **Blind Indexing (HMAC-SHA256):** Búsqueda exacta de CURP y RFC sin necesidad de desencriptar la base de datos.
- **Captura en Campo con Canvas Quality Analyzer:** PWA móvil con análisis en tiempo real de desenfoque (Laplaciano), luminosidad e inclinación.
- **Purga Local Automática (`Zero-PII Post-Ack`):** Tras la confirmación sincrónica del servidor, las imágenes temporales en el teléfono del promotor se eliminan de inmediato, neutralizando riesgos por robo o extravío.

### ✅ Fase 3: Persistencia Relacional Centralizada & Bitácora WORM (Certificado CRUSE-APO-2026-003)
- **Triggers WORM Nativos a Nivel de Motor:** Triggers ineludibles que abortan con `RAISE EXCEPTION` / `RAISE(ABORT)` cualquier sentencia `UPDATE` o `DELETE` sobre `audit_events`.
- **Cadena de Integridad Merkle SHA-256:** Encadenamiento criptográfico con bloque génesis institucional y verificación visual en tiempo real.
- **Runner de Migraciones con Checksum SHA-256:** Detección de cualquier alteración en scripts DDL históricos.

### ✅ Fase 4: Motor de Conciliación Quincenal Automatizado (Certificado CRUSE-APO-2026-004)
- **Matriz de 4 Estados Deterministas:**
  1. `MATCH_EXACT`: Cuota cubierta al 100% ($569.44). Actualiza expediente a `conciliado`.
  2. `DISCREPANCY_UNDERPAYMENT`: Retención parcial. Aplica cascada de pagos (Seguro -> Interés -> IVA -> Capital).
  3. `MISSING_IN_PAYROLL`: Alerta roja de baja laboral no reportada para el Oficial de Cumplimiento.
  4. `DISCREPANCY_OVERPAYMENT`: Excedente recibido con acreditación de saldo a favor.
- **Manifiesto Criptográfico Sellado:** Sello SHA-256 único por lote registrado en la bitácora WORM.
- **Actas Oficiales y Layouts SIF/CIB:** Generación automática de actas firmadas para la UNE y exportación CSV para el core bancario de Logic Systems.

### ✅ Fase 5: Gobernanza de Entrega, CI/CD & Auditoría de Secretos (Certificado CRUSE-APO-2026-005)
- **Pipeline Automatizado GitHub Actions (`.github/workflows/ci.yml`):** Validación en 4 etapas (Clean install, Linting estricto, Build de producción y verificación forense de bloques A, B y C).
- **Higiene Criptográfica:** Repositorio 100% libre de claves privadas, con `.gitignore` exhaustivo y `.env.example` sanitizado.
- **Manuales Técnicos:** `DEPLOYMENT.md` (despliegue en servidores Ubuntu/Nginx/Postgres) y `MANUAL_UNE_CUMPLIMIENTO.md` (guía para el Lic. Gerardo Olvera).

---

## 3. PUESTA EN MARCHA RÁPIDA

### Requisitos
- Node.js v22.0+ LTS
- npm v10.0+

### Ejecución Local
```bash
# 1. Clonar e instalar
git clone https://github.com/halvarez22/CRUSE_FINTECH.git
cd CRUSE_FINTECH/cruse-fintech-portal
npm ci

# 2. Configurar variables de entorno
cp .env.example .env

# 3. Verificación de Tipos Estrictos (Regla 6 SQA: Cero errores, Cero any)
npm run lint

# 4. Iniciar servidor de desarrollo
npm run dev
```

El portal estará operativo en `http://localhost:3000`.

---

## 4. GOBERNANZA DE IDENTIDADES Y PROVISIONAMIENTO ZERO-TRUST (CRUSE-APO-2026-028 / 030)

| Rol | Correo Electrónico | Autenticación | Doble Factor (2FA SMS — Cero Apps) |
| :--- | :--- | :--- | :--- |
| **Oficial de Cumplimiento (UNE)** | `gerardo.olvera@cruse.com.mx` | Generada vía `seed:dev` / Out-of-Band | Código SMS de 6 dígitos enviado al móvil registrado (`phone_number`) |
| **Dirección General (Admin)** | `admin@cruse.com.mx` | Generada vía `seed:dev` / Out-of-Band | Código SMS de 6 dígitos enviado al móvil registrado (`phone_number`) |
| **Promotor de Campo (PWA)** | `promotor@cruse.com.mx` | Generada vía `seed:dev` / Out-of-Band | Código SMS de 6 dígitos enviado al móvil registrado (`phone_number`) |

---

## 5. DOCUMENTACIÓN COMPLEMENTARIA

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Guía completa de despliegue en Linux con Nginx SSL TLS 1.3, PostgreSQL 16 y backups inmutables en S3 Object Lock.
- [`MANUAL_UNE_CUMPLIMIENTO.md`](./MANUAL_UNE_CUMPLIMIENTO.md) — Manual operativo forense para el Lic. Gerardo Olvera (verificación Merkle, conciliación y actas).
- [`AGENTS.md`](./AGENTS.md) — Reglas inamovibles de arquitectura (APO, HRU, SSD, SQA y Anti-God-Object < 600 líneas).
