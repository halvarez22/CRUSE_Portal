/**
 * FUENTE DE VERDAD DE MÓDULOS EJECUTIVOS Y ESTRATÉGICOS (BLOQUES B Y C)
 * Expediente: CRUSE-APO-2026-029
 * Conforme a la Regla 2 (HRU — Cero Hardcoding inline en componentes) y Regla 3 (Anti-God-Object).
 */

import {
  ExpansionHubItem,
  OperationsManualStep,
  PitchSlideItem,
} from '../types/executive';

export const PITCH_SLIDES_DATA: readonly PitchSlideItem[] = [
  {
    id: 1,
    title: 'Cruse: El Futuro del Crédito de Nómina Humano y Tecnológico',
    subtitle: 'Consolidación de una SOFOM E.N.R. de Alta Calidad hacia una Fintech de Expansión Nacional',
    category: 'Visión Ejecutiva',
    investorNotes:
      'Enfatizar los 16 años de trayectoria impecable en Chihuahua (desde 2010), membresía ASOFOM (puntaje 2.9 Alta Calidad) y la expansión a 3 Hubs Nacionales con PostgreSQL Cloud e IA.',
    highlights: [
      'Fundada en 2010 en Chihuahua, Chih., con Certificación 2.9 SOFOM Alta Calidad.',
      'Retención directa vía nómina institucional (STSGECH, Supremo Tribunal, Poderes Judiciales).',
      'Core Bancario 3FN v4 en Azure PostgreSQL 16 con seguridad Zero-Trust 2FA y cifrado AES-GCM-256.',
    ],
    metrics: [
      { label: 'Trayectoria', value: '16+ Años', accent: 'emerald' },
      { label: 'Morosidad Histórica', value: '< 1.8%', accent: 'cyan' },
      { label: 'Certificación ASOFOM', value: '2.9 / 3.0', accent: 'amber' },
    ],
  },
  {
    id: 2,
    title: 'El Diagnóstico: El Salto del Modelo Manual al Portal Unificado',
    subtitle: 'Eliminación definitiva de Excel, WhatsApp personal y accesos remotos inseguros',
    category: 'Oportunidad y Problema',
    investorNotes:
      'Demostrar que el reemplazo de hojas de cálculo y procesos en papel por un Core Cloud centralizado permite crecer 4x sin multiplicar costos administrativos.',
    highlights: [
      'Antes: Captura manual en Excel, copias físicas de INE y conciliación quincenal de 3 a 5 días.',
      'Ahora: Escáner PWA móvil con purga Zero-PII, base de datos relacional centralizada y conciliación en segundos.',
      'Blindaje total ante CNBV, CONDUSEF, UIF y Círculo de Crédito desde un único Portal Web Seguro.',
    ],
    metrics: [
      { label: 'Tiempo de Originación', value: '< 2 Horas', accent: 'emerald' },
      { label: 'Dependencia de Excel', value: '0%', accent: 'cyan' },
      { label: 'Retención Bitácora WORM', value: '5 Años', accent: 'amber' },
    ],
  },
  {
    id: 3,
    title: 'La Estrategia: Tesis de Inversión y 4 Pilares de Crecimiento',
    subtitle: '1. Expansión a 3 Hubs | 2. Core Cloud 3FN | 3. IA & Scoring Explicable | 4. Conciliación Automática',
    category: 'Tesis Financiera',
    investorNotes:
      'Destacar cómo los 4 pilares tecnológicos permiten escalar la cartera hacia $400M+ MXN manteniendo control estricto de riesgo y cumplimiento PLD/FT.',
    highlights: [
      'Pilar 1: Despliegue comercial en Chihuahua (Norte), León (Bajío) y Cancún (Sur).',
      'Pilar 2: Motor de fondeo e inversionistas con cálculo exacto de rendimientos y retención ISR.',
      'Pilar 3: Scoring paramétrico explicable (Bajo, Medio, Alto riesgo) + Asistente IA 24/7.',
      'Pilar 4: Emisión sindical e ingesta masiva determinista de cortes quincenales.',
    ],
    metrics: [
      { label: 'Escalamiento Cartera', value: '4.0x', accent: 'emerald' },
      { label: 'Ahorro Operativo', value: '68%', accent: 'cyan' },
      { label: 'Hubs Nacionales', value: '3 Sedes', accent: 'amber' },
    ],
  },
  {
    id: 4,
    title: 'Oferta Financiera y Productos de Crédito de Nómina',
    subtitle: 'Crédito Clásico (1.97% quincenal) y Crédito Express (3.33% quincenal) con descuento directo',
    category: 'Productos',
    investorNotes:
      'Cruse ofrece tasas competitivas y transparentes con 0% comisión por apertura y póliza de seguro de vida de $35,000 MXN incluida en Crédito Clásico.',
    highlights: [
      'Crédito Clásico (Normal): $10,000 a $500,000 MXN | Plazos 24, 48 y 72 quincenas | Tasa 1.97% qnal fija.',
      'Crédito Express: $1,000 a $20,000 MXN | Plazos 6, 14 y 20 quincenas | Dispersión SPEI < 2 horas.',
      'Seguro de Vida Colectivo ($35,000 MXN suma asegurada, $22.85 quincenales) y hasta 4 créditos activos por cliente.',
    ],
    metrics: [
      { label: 'Tasa Quincenal Clásico', value: '1.97%', accent: 'emerald' },
      { label: 'Tasa Quincenal Express', value: '3.33%', accent: 'cyan' },
      { label: 'Comisión por Apertura', value: '0%', accent: 'amber' },
    ],
  },
  {
    id: 5,
    title: 'Análisis Comparativo del Mercado de Crédito en México',
    subtitle: 'Por qué Cruse supera a Financiera Independencia, Santander, Banorte, Kubo y Creditea',
    category: 'Ventaja Competitiva',
    investorNotes:
      'Subrayar la tasa anual fija de 47.50% frente al 122% de Financiera Independencia o 65% de Santander, sin comisiones ocultas.',
    highlights: [
      'Por cada $10,000 a 24 quincenas en Cruse el trabajador paga $569.44 quincenales ($13,666.56 total).',
      'Cero cobros por apertura, investigación o disposición de efectivo.',
      'Aprobación ágil respaldada por convenio sindical/institucional y capacidad real de pago (tope 35%).',
    ],
    metrics: [
      { label: 'Cuota $10k (24 qnas)', value: '$569.44', accent: 'emerald' },
      { label: 'Tasa Anual Cruse', value: '47.50%', accent: 'cyan' },
      { label: 'Tasa Competencia Alta', value: '122.00%', accent: 'amber' },
    ],
  },
  {
    id: 6,
    title: 'Hoja de Ruta de Expansión Nacional (3 Hubs Estratégicos)',
    subtitle: 'Hub 1: Chihuahua (HQ) → Hub 2: León, Guanajuato (Bajío) → Hub 3: Cancún, Q. Roo (Sur)',
    category: 'Roadmap Geográfico',
    investorNotes:
      'Mostrar la distribución de cartera y monitoreo de Semáforo de Morosidad (Verde, Amarillo, Rojo) en tiempo real por cada Hub.',
    highlights: [
      'Hub 1 Chihuahua: Base matriz consolidada con Supremo Tribunal y STSGECH (35,000 servidores públicos).',
      'Hub 2 León / Bajío: Corredor industrial y gubernamental con 110,000 empleados objetivo.',
      'Hub 3 Cancún / Riviera Maya: Sector público estatal y municipal en crecimiento acelerado (95,000 empleados).',
    ],
    metrics: [
      { label: 'Mercado Potencial', value: '240,000 emp.', accent: 'emerald' },
      { label: 'Meta Cartera 3 Hubs', value: '$400M MXN', accent: 'cyan' },
      { label: 'Control Centralizado', value: '100% Cloud', accent: 'amber' },
    ],
  },
  {
    id: 7,
    title: 'Suite de Inteligencia Artificial y Seguridad Criptográfica',
    subtitle: 'Asistente IA 24/7 (Público e Interno Operativo), Scoring Paramétrico y Escáner Móvil',
    category: 'Tecnología & IA',
    investorNotes:
      'Explicar que el Asistente Interno consulta métricas agregadas en PostgreSQL bajo Zero-PII estricto, sin exponer jamás CURP o nombres al LLM.',
    highlights: [
      'Asistente IA Público 24/7 para empleados afiliados + Asistente IA Interno para Dirección y Cumplimiento.',
      'Motor de Scoring Paramétrico Explicable que clasifica solicitudes en Bajo, Medio o Alto Riesgo.',
      'Cifrado Envelope AES-GCM-256 + Blind Indexing HMAC-SHA256 + Cruce automático PLD/FT (69-B, UIF, OFAC, PEPs).',
    ],
    metrics: [
      { label: 'Modelo IA', value: 'LLaMA 3.3 70B', accent: 'emerald' },
      { label: 'Exposición PII a IA', value: '0 Bytes', accent: 'cyan' },
      { label: 'Cifrado en Reposo', value: 'AES-GCM-256', accent: 'amber' },
    ],
  },
  {
    id: 8,
    title: 'Unit Economics y Modelo Financiero de Alta Rentabilidad',
    subtitle: 'Reducción del Costo de Adquisición (CAC) y alta retención en recréditos',
    category: 'Finanzas & Márgenes',
    investorNotes:
      'Presentar la caída del CAC a $380 MXN gracias a la digitalización y la tasa de renovación del 88% de los acreditados.',
    highlights: [
      'CAC reducido en 68% ($380 MXN digital vs $1,200 MXN tradicional en papel).',
      'Retención en la fuente antes de la dispersión salarial, blindando el flujo de caja quincenal.',
      '88% de los acreditados solicitan renovación o recrédito al cumplir su ciclo de pagos.',
    ],
    metrics: [
      { label: 'CAC Digital', value: '$380 MXN', accent: 'emerald' },
      { label: 'Tasa de Retención', value: '88%', accent: 'cyan' },
      { label: 'Tope Descuento Nómina', value: '35% Neto', accent: 'amber' },
    ],
  },
  {
    id: 9,
    title: 'Gobierno Corporativo, Fondeo y Cumplimiento CNBV / UIF',
    subtitle: 'Trazabilidad total para Inversionistas, Auditores y Autoridades Financieras',
    category: 'Estructura de Capital & PLD',
    investorNotes:
      'Destacar el módulo de Fondeo 3FN v4 y el blindaje PLD/FT con sellos criptográficos SHA-256 inmutables por 5 años.',
    highlights: [
      'Gestión de líneas de fondeo e inversionistas con cálculo automatizado de intereses e ISR (0.5% / 0.9%).',
      'Generación automática del layout oficial de Círculo de Crédito (001496) y layouts SIF/CIB Logic Systems.',
      'Barrido automatizado contra listas negras SAT 69-B, UIF, OFAC y PEPs con actas certificadas WORM.',
    ],
    metrics: [
      { label: 'Fondo Cartera', value: '65% Capital', accent: 'emerald' },
      { label: 'Tecnología & IA', value: '20% Capital', accent: 'cyan' },
      { label: 'Expansión Hubs', value: '15% Capital', accent: 'amber' },
    ],
  },
  {
    id: 10,
    title: 'Visión 2026–2030: De Microfinanciera Regional a Referente Fintech Nacional',
    subtitle: 'Plataforma lista en producción para escalar con seguridad grado bancario',
    category: 'Conclusión & ROI',
    investorNotes:
      'Invitar a explorar en vivo el Simulador ROI de Cartera, el Evaluador de Scoring y el Dashboard por Hubs Nacionales.',
    highlights: [
      '100% de los módulos operativos, ejecutivos y regulatorios unificados en una sola plataforma.',
      'Acceso blindado con Doble Factor (2FA SMS en teléfono propio) y revocación instantánea (Kill-Switch).',
      'Transparencia absoluta en tiempo real para Dirección General, Mesa de Control e Inversionistas.',
    ],
    metrics: [
      { label: 'Disponibilidad Cloud', value: '99.9% SLA', accent: 'emerald' },
      { label: 'Auditoría Forense', value: '100% WORM', accent: 'cyan' },
      { label: 'Estatus Plataforma', value: 'En Producción', accent: 'amber' },
    ],
  },
];

export const EXPANSION_HUBS_DATA: readonly ExpansionHubItem[] = [
  {
    id: 'hub-1-chihuahua',
    hubCode: 'CHIHUAHUA',
    name: 'Hub 1: Chihuahua, Chih. (Sede Matriz HQ)',
    region: 'Norte / Chihuahua',
    phase: 'Operación Consolidada & Escalamiento Digital',
    launchMonth: 'Fase 1 — Activo',
    targetEmployees: 35000,
    targetAgreements: [
      'Supremo Tribunal de Justicia del Estado de Chihuahua (Activo)',
      'Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH)',
      'Secretaría de Hacienda y Organismos Descentralizados de Chihuahua',
    ],
    projectedPortfolioMillions: 85,
    status: 'active',
    coordinates: { x: 38, y: 28 },
    description:
      'Sede matriz desde 2010 (Edificio Quorum, Col. Saucito). Centro de dirección estratégica, mesa de control, cumplimiento PLD/FT y operación de convenios estatales consolidados.',
    keyInstitutions: ['STSGECH', 'Supremo Tribunal de Justicia', 'Secretaría de Hacienda Chih.'],
  },
  {
    id: 'hub-2-leon',
    hubCode: 'LEON',
    name: 'Hub 2: León, Guanajuato (Sede Centro / Bajío)',
    region: 'Centro / León, Gto.',
    phase: 'Expansión Comercial & Convenios del Bajío',
    launchMonth: 'Fase 2 — En Despliegue',
    targetEmployees: 110000,
    targetAgreements: [
      'Poder Judicial del Estado de Guanajuato (PODER_JUDICIAL_GTO)',
      'Sindicatos del Sector Salud y Magisterio de Guanajuato (SINDICATO_SALUD_GTO)',
      'Municipios del Corredor Industrial (León, Irapuato, Celaya, Guanajuato)',
    ],
    projectedPortfolioMillions: 165,
    status: 'in-preparation',
    coordinates: { x: 49, y: 58 },
    description:
      'Hub estratégico del Bajío con alta densidad de servidores públicos estatales, municipales y del sector salud con esquema de retención quincenal directa.',
    keyInstitutions: ['Poder Judicial Gto.', 'Sindicatos Salud y Educación', 'Municipios del Bajío'],
  },
  {
    id: 'hub-3-cancun',
    hubCode: 'CANCUN',
    name: 'Hub 3: Cancún, Quintana Roo (Sede Sur / Riviera Maya)',
    region: 'Sur / Cancún, Q. Roo',
    phase: 'Expansión Sector Público Sur & Riviera Maya',
    launchMonth: 'Fase 3 — Expansión Sur',
    targetEmployees: 95000,
    targetAgreements: [
      'Poder Judicial del Estado de Quintana Roo (PODER_JUDICIAL_QROO)',
      'Ayuntamiento de Benito Juárez Cancún y Solidaridad (AYUNTAMIENTO_CANCUN)',
      'Sindicato Único de Trabajadores al Servicio del Gobierno de Q. Roo',
    ],
    projectedPortfolioMillions: 150,
    status: 'planned',
    coordinates: { x: 86, y: 60 },
    description:
      'Hub estratégico del sureste mexicano con alto dinamismo económico y creciente plantilla de trabajadores gubernamentales y municipales.',
    keyInstitutions: ['Poder Judicial Q. Roo', 'Ayuntamiento Benito Juárez', 'Gobierno de Q. Roo'],
  },
];

export const OPERATIONS_MANUAL_STEPS: readonly OperationsManualStep[] = [
  {
    id: 1,
    title: '1. Firma y Alta de Convenio Institucional',
    manualProcess: 'Negociación en papel, control de reglas de descuento en carpetas físicas y hojas sueltas.',
    digitalProcess: 'Alta en catálogo inmutable de Convenios (STSGECH, Supremo Tribunal, Bajío, Cancún) con reglas de seguro de vida, frecuencia y carta sindical.',
    aiEnhancement: 'Monitoreo automático de colocación, capacidad de descuento y semáforo de morosidad por convenio y por Hub Nacional.',
    slaBefore: '15 a 30 días',
    slaAfter: 'Inmediato en Portal',
    responsibleRole: 'Dirección General / Administrador',
  },
  {
    id: 2,
    title: '2. Simulación y Pre-Calificación del Trabajador',
    manualProcess: 'Cálculo manual en Excel sujeto a errores de fórmula o atención limitada de 8:00 a 15:00 hrs.',
    digitalProcess: 'Simulador Público 24/7 con tabla de amortización exacta (Decimal.js) y cálculo de préstamo máximo según el tope del 35% de sueldo neto.',
    aiEnhancement: 'Asistente Inteligente 24/7 (Groq LLaMA 3.3 70B) que orienta al trabajador sin recabar datos personales sensibles (Zero-PII).',
    slaBefore: '2 a 4 horas',
    slaAfter: '< 30 segundos',
    responsibleRole: 'Trabajador / Promotor / Bot IA 24/7',
  },
  {
    id: 3,
    title: '3. Captura en Campo y Escaneo Seguro (PWA Móvil)',
    manualProcess: 'Fotocopias físicas de INE, recibos de nómina enviados por WhatsApp personal y extravío de documentos.',
    digitalProcess: 'Escáner Móvil guiado con validación óptica en tiempo real (nitidez, iluminación, encuadre) y consentimiento LFPDPPP.',
    aiEnhancement: 'Cifrado AES-GCM-256 antes de guardar y Purga Automática Local (Zero-PII Post-Ack) en el teléfono del promotor tras sincronizar.',
    slaBefore: '24 a 48 horas',
    slaAfter: '< 5 minutos',
    responsibleRole: 'Promotor en Campo',
  },
  {
    id: 4,
    title: '4. Evaluación de Scoring y Cruce PLD/FT (69-B / UIF)',
    manualProcess: 'Revisión subjetiva del expediente sin cruce automatizado contra listas negras de lavado de dinero.',
    digitalProcess: 'Cruce automático Blind Index (HMAC-SHA256) contra listas SAT 69-B, UIF, OFAC y PEPs + Evaluador de Scoring Paramétrico.',
    aiEnhancement: 'Dictamen explicable de Riesgo (🟢 Bajo, 🟡 Medio, 🔴 Alto) con justificación ejecutiva generada por IA sobre parámetros deterministas.',
    slaBefore: '24 a 72 horas',
    slaAfter: 'Instantáneo (< 3 seg)',
    responsibleRole: 'Oficial de Cumplimiento / Aprobador',
  },
  {
    id: 5,
    title: '5. Activación de Crédito, Dispersión SPEI y Fondeo',
    manualProcess: 'Registro manual en libros de Excel separados para cartera, seguro de vida e inversionistas.',
    digitalProcess: 'Activación transaccional ACID en PostgreSQL 16 que genera el contrato, tabla de amortización e inscripción automática a la póliza de seguro de vida ($35,000 MXN).',
    aiEnhancement: 'Vinculación con líneas de fondeo e inversionistas (cálculo exacto de rendimientos brutos, retención de ISR y pagos netos).',
    slaBefore: '24 a 48 horas',
    slaAfter: '< 2 horas vía SPEI',
    responsibleRole: 'Administrador / Mesa de Control',
  },
  {
    id: 6,
    title: '6. Conciliación Quincenal, Cobranza y Reportes Regulatorios',
    manualProcess: 'Cruce manual renglón por renglón en Excel entre lo enviado al sindicato y lo retenido por Tesorería.',
    digitalProcess: 'Emisión de layout sindical, ingesta masiva determinista del archivo de retención, cascada de prelación (Seguro → Interés → IVA → Capital) y acta sellada SHA-256.',
    aiEnhancement: 'Generación en 1 clic de layouts para SIF/CIB (Logic Systems), Círculo de Crédito (001496) y consultas en lenguaje natural al Asistente IA Interno.',
    slaBefore: '3 a 5 días por quincena',
    slaAfter: '< 1 minuto por lote',
    responsibleRole: 'Oficial de Cumplimiento / Administración',
  },
];

export const INTERNAL_AI_QUICK_PROMPTS: readonly { title: string; question: string }[] = [
  {
    title: '📊 Colocación del Mes y Cartera Activa',
    question: '¿Cuántos créditos se otorgaron este mes y cuál es el capital colocado y vigente total?',
  },
  {
    title: '🛡️ Alertas Pendientes de Lavado de Dinero (PLD/FT)',
    question: '¿Hay alertas pendientes de lavado de dinero (PLD/FT) o coincidencias en listas 69-B, UIF, OFAC o PEPs?',
  },
  {
    title: '🚦 Semáforo de Morosidad por Hub Nacional',
    question: '¿Cómo está el semáforo de morosidad (Verde, Amarillo y Rojo) y la distribución de cartera en los Hubs de Chihuahua, León y Cancún?',
  },
  {
    title: '🏦 Estado de Líneas de Fondeo e Inversionistas',
    question: '¿Cuál es el resumen actual de inversionistas activos y capital comprometido en fondeo frente a la cartera colocada?',
  },
];
