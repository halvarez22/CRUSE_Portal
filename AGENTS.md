# Reglas Persistentes del Proyecto — Microfinanciera Cruse Fintech

**Proyecto:** Portal Web Seguro & Ecosistema Fintech — Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.  
**Stack Principal:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Express (Node.js) + Groq SDK (LLaMA 3.3 70B) + Web Crypto API / Node Crypto (AES-GCM 256, HMAC-SHA256) + Base de Datos Relacional  
**Repositorios de Referencia:**
- Negocio & Módulos de Valor: `https://github.com/halvarez22/CRUSE_FINTECH`
- Seguridad Industrial, Bitácora, Escaneo & Cifrado: `https://github.com/halvarez22/MC`

---

## 🛑 COMPUERTA DE BLOQUEO DE HERRAMIENTAS (PRE-FLIGHT TOOL GATE — OBLIGATORIA)

> **REGLA MECÁNICA DE EJECUCIÓN (PROTOCOLO DE 2 TURNOS):**
> Ante **cualquier** bug, error (`500`, `400`, compilación, UI) o requerimiento de cambio reportado por el usuario:
> 1. **PROHIBICIÓN EN TURNO 1:** Queda **terminantemente prohibido** invocar `replace_file_content` o `write_to_file` sobre archivos de código en el mismo turno en que el usuario reporta un problema o solicita un cambio (salvo que el usuario ya esté respondiendo "Aprobado / Procede" a un Plan APO previo).
> 2. **ENTREGABLE OBLIGATORIO EN TURNO 1 (Solo lectura):** El agente solo puede usar herramientas de lectura (`view_file`, búsqueda, logs) y debe responder entregando:
>    - **(1) Diagnóstico de Causa Raíz.**
>    - **(2) Mapeo del Grafo de Impacto Global y Efectos Secundarios.**
>    - **(3) Plan de Implementación APO consolidado.**
>    - **(4) Solicitud explícita:** *"¿Autorizas ejecutar este plan?"* y detener su turno sin modificar código.
> 3. **EJECUCIÓN EN TURNO 2:** Únicamente tras recibir la aprobación explícita del usuario, el agente puede modificar los archivos autorizados.

---

## REGLA INAMOVIBLE 1: APO (Auditoría Profunda Obligatoria) y Planning Mode Estricto

Quedan estrictamente prohibidos los "hotfixes" ciegos o rápidos. **NINGÚN CAMBIO ES TRIVIAL.**  
Queda rotundamente prohibido aplicar la excepción de "cambios rápidos de UI" o "ajustes menores".  
Antes de realizar CUALQUIER modificación a una lógica existente, el agente DEBE obligatoriamente:

1. **Mapeo del Grafo de Impacto Global (Análisis Holístico):** Queda estrictamente prohibido analizar únicamente el archivo donde se detectó el issue. El agente debe realizar una búsqueda global en el workspace de todas las variables, funciones, contratos de API, tipos y componentes de UI involucrados en el flujo. Debe construir mentalmente la cadena completa de afectación (Frontend → API → Backend → Cripto/Seguridad → Base de Datos) ANTES de proponer soluciones.
2. **Identificación Previa de Efectos Secundarios (Zero Regressions):** El agente debe documentar y listar explícitamente qué otros módulos, archivos o componentes periféricos se verán alterados o requieren adaptaciones debido al cambio. No se permite descubrir dependencias "sobre la marcha" durante la fase de escritura.
3. **Planning Mode Multi-Archivo (SIEMPRE):** Presentar un Plan de Implementación formal que detalle el diagnóstico técnico global y abarque de forma consolidada todos los archivos que serán modificados. El agente solicitará la aprobación expresa y explícita del usuario antes de escribir o modificar una sola línea de código.

---

## REGLA INAMOVIBLE 2: HRU (Cero Hardcoding, Cero Regresiones, Universalidad Total)

Todo desarrollo, ajuste o refactorización debe regirse por el estándar HRU:

- **Cero Hardcoding:** No se permite codificar valores fijos, fórmulas matemáticas sueltas, rutas estáticas o textos quemados en el código. Toda lógica debe ser dinámica y responder a fuentes centralizadas de verdad:
  - Constantes y fórmulas financieras (tasa 1.97% quincenal Normal, 3.33% Express, amortización, IVA, seguro de vida 22.85) viven exclusivamente en `src/config/financialConstants.ts`.
  - Datos de negocio (hubs, competidores, productos, textos institucionales, perfiles) viven en `src/data/cruseData.ts`, nunca inline en componentes.
- **Cero Regresiones:** El sistema debe avanzar sin destruir funcionalidad previa. Cualquier ajuste debe someterse a pruebas de no-regresión. No es aceptable sacrificar una funcionalidad operativa para habilitar otra.
- **Universalidad Total:** Las funcionalidades deben ser agnósticas al tipo de recurso y consistentes en diseño y arquitectura. Todos los módulos del Portal deben operar bajo las mismas reglas de navegación, manejo de estado, diseño responsive y feedback visual.

---

## REGLA INAMOVIBLE 3: Arquitectura Anti-God-Object

Queda estrictamente prohibido generar archivos masivos o acumular lógica de negocio en un solo componente.

- **Límite estricto:** Ningún archivo puede superar las 600 líneas de código. Si un componente o servicio se aproxima a este límite, el agente debe alertar y proponer extracción a sub-componentes, hooks o utilidades antes de continuar.
- **Delegación Obligatoria:** Todo nuevo flujo, estado u orquestador lógico DEBE construirse en un archivo independiente e importarse donde se necesite.
- **Responsabilidad Única (SOLID):**
  - Servidores y routers (`server.ts`, routers en `api/`) solo orquestan peticiones HTTP y aplican middlewares.
  - La lógica de negocio con IA (prompts, modelos, validaciones) reside en servicios dedicados (`services/ai/` o `services/groq/`).
  - La lógica criptográfica y de auditoría vive aislada en sus propios servicios (`services/crypto/`, `services/audit/`).
  - Los componentes React solo renderizan la vista y delegan cálculos y efectos a custom hooks o utilidades puras.
- **Estructura Modular del Proyecto:**
  - `src/components/` — Componentes de UI puros (divididos por dominios: deck, simuladores, captura, bitácora, etc.)
  - `src/hooks/` — Lógica reactiva reutilizable (cámara, auditoría, sesión, offline)
  - `src/services/` — Servicios de cliente y lógica compartida (auditoría forense, crypto cliente, OCR)
  - `src/config/` — Constantes de negocio y financieras
  - `src/data/` — Única fuente de verdad de datos estáticos institucionales
  - `src/types/` — Contratos de tipos TypeScript centralizados
  - `server/` o `api/` — Endpoints backend, middlewares de seguridad, 2FA y conexión a BD
  - `db/` — Esquemas relacionales, migraciones y repositorios de datos

---

## REGLA INAMOVIBLE 4: U-First (Usabilidad y Experiencia Fantástica)

Todo desarrollo o refactorización debe tener como máxima prioridad la experiencia del usuario final (Dirección, Oficial de Cumplimiento, Operativos y Promotores en campo).

- **Empatía Técnica:** Está estrictamente prohibido diseñar flujos que requieran que el usuario teclee comandos técnicos, UUIDs internos o entienda la arquitectura del sistema. Las interfaces deben ser intuitivas, asistidas y accesibles.
- **Cero Callejones sin Salida (Frictionless):** Cada pantalla y modal DEBE proveer siempre una salida interactiva clara (botones de "Volver", "Cancelar", "Nueva Simulación", "Descargar Reporte"). Prohibido dejar al usuario varado en un estado sin retorno.
- **Efecto WOW:** La plataforma transmite máxima solvencia, vanguardia e institucionalidad:
  - Módulos ejecutivos (Pitch, ROI, Scoring) con acabados de alta gama, animaciones suaves y tipografía limpia.
  - Módulo de campo (Promotores) ultra-rápido, con retroalimentación inmediata (sonido de obturador, guías visuales de encuadre en cámara y mensajes de calidad en tiempo real).
- **Identidad Visual Cruse:**
  - Logo corporativo (`CRUSE_LOGO.png`): Debe presentarse siempre con fondo blanco o contenedor de contraste óptimo para garantizar legibilidad.
  - Paleta institucional: Azul marino `#0D1B3E`, Cyan/Teal `#00D1FF`, Dorado/Acento `#D4AF37`, Fondo oscuro premium `#0A0A0A` / Slate 950, y soporte para modo claro/oscuro donde aplique.

---

## REGLA INAMOVIBLE 5: SSD (Seguridad por Diseño y Protección LFPDPPP)

Toda funcionalidad debe cumplir con las regulaciones de la CNBV y la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).

- **Protección de Secrets:** Las API keys (Groq, JWT secrets, llaves KEK de cifrado, credenciales de BD) NUNCA se hardcodean en el código fuente. Se leen exclusivamente desde variables de entorno de servidor (`process.env.*`). Queda terminantemente prohibido exponer llaves maestras en variables públicas de cliente (`VITE_*`). El archivo `.env` está en `.gitignore` y jamás se comitea.
- **Cifrado en Reposo y Tránsito (Heredado de MC):**
  - Documentos e información confidencial (INE, recibos de nómina, CURP, RFC) deben cifrarse mediante Envelope Encryption (**AES-GCM de 256 bits** con llaves DEK envueltas por KEK).
  - Consultas seguras mediante **Blind Indexing (HMAC-SHA256)** para CURP/RFC, permitiendo búsquedas exactas sin desencriptar toda la base de datos.
- **Purga Local de Dispositivos (`Zero-PII Post-Ack`):**
  - Los promotores capturan imágenes en la PWA móvil; una vez sincronizadas y confirmadas por el backend, las fotos temporales en IndexedDB/Blob del dispositivo del promotor se purgan de inmediato para neutralizar el riesgo por robo o extravío del teléfono.
- **Bitácora Forense Inmutable:**
  - Todo acceso a datos personales o movimiento operativo crítico (`SCREEN_VIEW`, consulta de expediente, login, generación de layouts) debe registrarse en la bitácora forense (`services/audit/`) con actor, rol, timestamp, IP, pantalla y hash de integridad. Retención mínima de 5 años para auditoría CNBV/INAI.
- **Validación Estricta y Sanitización de Entradas:**
  - Cada endpoint backend debe validar rigurosamente tipos, longitudes y rangos de datos numéricos.
  - Sanitización estricta de prompts hacia el LLM para evitar prompt injection.
- **Zero Trust entre Capas:** El frontend jamás interactúa con servicios externos sensibles ni maneja credenciales maestras; todo pasa a través de la API segura del Portal con autenticación de dos factores (2FA) y control de acceso basado en roles (RBAC).

---

## REGLA INAMOVIBLE 6: SQA (Software Quality Assurance) y Refactorización Segura

El desarrollo y evolución de módulos debe regirse por un marco estricto de calidad:

- **Mapeo previo de dependencias:** Antes de alterar cualquier función, contrato de API, servicio o tipo, realizar una búsqueda global para verificar y actualizar todas las referencias.
- **Refactorización atómica:** Los cambios se ejecutan módulo por módulo. Prohibido realizar refactorizaciones simultáneas masivas en múltiples subsistemas sin validación unitaria.
- **TypeScript Estricto:** Todos los tipos deben estar definidos de forma explícita en `src/types/`. Queda prohibido el uso de `any` (salvo captura de excepciones en catch con comentario técnico obligatorio justificándolo).
- **Verificación Continua de Tipos:** Tras cualquier modificación de código, el agente debe ejecutar la verificación de tipos (`tsc --noEmit` o npm run lint) para certificar cero errores de compilación antes de dar la tarea por concluida.

---

## REGLA INAMOVIBLE 7: Protocolo de Descubrimiento de Código y Cero Parches Iterativos

Para asegurar un avance sólido y sin retrabajos:

- **Inspección Obligatoria de Contratos:** El agente no debe asumir ni suponer cómo funcionan los componentes, APIs o bases de datos existentes. Debe examinar directamente el código fuente y contratos antes de escribir soluciones.
- **Planes de Implementación Consolidados:** Cada propuesta debe presentarse en un plan consolidado e integral, resolviendo el problema de raíz y anticipando ajustes en todos los archivos relacionados.
- **Bucle de Detención y Alerta:** Si durante la ejecución se detecta un efecto secundario o una inconsistencia no prevista, el agente debe DETENER inmediatamente la escritura de código, reevaluar el impacto, actualizar el plan y solicitar confirmación al usuario antes de improvisar parches locales.
- **Regla de los Dos Intentos:** Si un enfoque técnico falla en dos ocasiones, está prohibido insistir con un tercer intento idéntico. Se debe diagnosticar la causa raíz, proponer un enfoque alternativo fundamentado y consultar con el usuario.

---

## Mapa Funcional del Ecosistema Cruse Portal

```
CRUSE_PORTAL/
├── PORTAL ADMINISTRATIVO & MÓDULOS DE VALOR (Base CRUSE_FINTECH)
│   ├── Pitch Inversionistas (10 slides interactivos)
│   ├── Simulador ROI de Cartera a 36 meses
│   ├── Simulador & Scoring de Crédito (Normal 1.97% vs Express 3.33%)
│   ├── Asistente Inteligente IA 24/7 (Groq LLaMA 3.3 70B)
│   ├── Matriz Comparativa de Competencia
│   ├── Mapa de Hubs Nacionales (Chihuahua, León, Cancún)
│   └── Manual Operativo Institucional
│
├── MÓDULO PWA DE PROMOTORES & CAPTURA EN CAMPO (Base MC)
│   ├── Escáner Móvil con análisis de calidad en tiempo real (blur, brillo, encuadre)
│   ├── Captura guiada: INE (anverso/reverso) + Recibos de nómina + Comprobantes
│   ├── Consentimiento LFPDPPP integrado
│   └── Purga automática local post-sincronización (Zero PII en celular)
│
├── CIBERSEGURIDAD, CRIPTOGRAFÍA & AUDITORÍA FORENSE (Base MC)
│   ├── Autenticación con 2FA y control de roles (RBAC)
│   ├── Cifrado en reposo y tránsito (AES-GCM 256 bits + KEK/DEK)
│   ├── Blind Indexing (HMAC-SHA256) para búsquedas de CURP/RFC
│   ├── Bitácora Forense Inmutable de movimientos (audit trail 5 años)
│   └── Visor Seguro de Expedientes y Documentos en el Portal
│
└── CORE OPERATIVO & CUMPLIMIENTO REGULATORIO (Nuevos componentes Fase 1)
    ├── Base de Datos Relacional Centralizada (sustituto formal de Excel)
    ├── Motor de Conciliación Quincenal Inteligente
    └── Generador de Archivos y Layouts para SIF/CIB (Logic Systems) y CNBV
```

---

## Estándares de Arquitectura Fase 2 (Auditoría Forense CRUSE-APO-2026-002)

1. **OBS-1: Carga Diferida (Lazy-Loading) del Motor OCR:**
   - La librería o motor de OCR solo se importa bajo demanda (`import(...)`) cuando el usuario activa la cámara en campo.
   - El análisis de calidad previo (Varianza del Laplaciano, brillo y bordes en Canvas) opera con un micro-servicio estático (< 3 KB) para proteger el LCP inicial de la PWA.
2. **OBS-2: Gestión KEK/DEK en Envelope Encryption:**
   - Toda miniatura de documento sensible o PII se encripta con una DEK (Data Encryption Key) efímera generada por expediente (`crypto.randomBytes(32)`).
   - La DEK es envuelta (wrapped) con la KEK (Key Encryption Key) maestra leída desde variables de entorno seguras de servidor o KMS, con versionado explícito (`kek_version: 1`).
3. **OBS-3: Rate Limiting Estricto en 2FA y Refresco:**
   - Endpoints de autenticación (`/api/auth/verify-totp`, `/api/auth/refresh`) cuentan con rate limiter de máximo 5 intentos fallidos en 15 minutos por IP/usuario.
   - Bloqueo temporal automático tras 5 fallos con registro inmediato en la bitácora forense (`LOGIN_FAILURE`, `outcome: 'denied'`).

---

## Directrices de Git y Despliegue

- **Repositorio:** `https://github.com/halvarez22/CRUSE_FINTECH`
- **Rama principal:** `main`
- **Flujo de trabajo:** Todo desarrollo o refactorización mayor se realiza en ramas de trabajo o previa confirmación explícita del usuario.
- **Archivos protegidos:** `.env`, credenciales y llaves privadas jamás se incluyen en commits.

