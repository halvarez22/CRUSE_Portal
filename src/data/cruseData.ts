/**
 * Fuente de Verdad Institucional de Microfinanciera Cruse SOFOM E.N.R.
 * Conforme a la Regla 2 (HRU) — Cero textos o catálogos quemados inline en componentes.
 */
import { CompanyInfo, LoanProduct, RequirementItem, PrivacyNoticeData } from '../types';

export const COMPANY_INFO: CompanyInfo = {
  name: "Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.",
  shortName: "Microfinanciera Cruse",
  tagline: "Un modelo ágil, seguro y sin fricciones para instituciones afiliadas",
  foundedYear: 2010,
  hqCity: "Chihuahua, Chihuahua",
  address: "Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.",
  officePhone: "(614) 411-15-44",
  cellPhone: "(614) 184-58-49",
  promoterWhatsappE164: "526141965449",
  promoterWhatsappDisplay: "(614) 196-54-49",
  promoterContactName: "Srita. Alma — Coordinación de Promotores en Campo",
  email: "contacto@cruse.com.mx",
  website: "https://cruse.com.mx",
  businessHours: "Lunes a Viernes de 8:00 a 15:00 hrs",
  asofomMemberSince: 2012,
  qualityCertification: "Certificación 2.9 SOFOM Alta Calidad",
  primaryAgreements: [
    "El Supremo Tribunal de Justicia del Estado de Chihuahua",
    "Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH)",
  ],
  uneContact: {
    title: "Titular de la Unidad Especializada de Atención a Usuarios (UNE) / Oficial de Cumplimiento",
    email: "gerardo.olvera@cruse.com.mx",
    phone: "(614) 411-15-44 / (614) 184-58-49",
    city: "Chihuahua, Chihuahua",
  },
};

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    id: "normal",
    name: "Crédito Clásico",
    tagline: "Financiamiento consolidado de mediano plazo para proyectos y patrimonio familiar",
    minAmount: 10000,
    maxAmount: 500000,
    terms: [24, 48, 72],
    interestRateText: "1.97% quincenal fija sin IVA (47.50% anual)",
    nominalRateFortnightly: 0.0197,
    nominalRateMonthly: 0.0395,
    annualRate: 0.475,
    catInformativePercent: 88.05,
    lifeInsuranceFortnightly: 22.85,
    lifeInsuranceCoverageMxn: 35000,
    openingCommissionPercent: 0,
    requiresProofOfAddress: true,
    requiresCreditBureau: false,
    disbursementTime: "< 24 horas",
  },
  {
    id: "express",
    name: "Crédito Express",
    tagline: "Liquidez inmediata descontada por nómina en menos de 2 horas sin aval",
    minAmount: 1000,
    maxAmount: 20000,
    terms: [6, 14, 20],
    interestRateText: "3.33% quincenal fija sin IVA (48.00% anual)",
    nominalRateFortnightly: 0.0333,
    nominalRateMonthly: 0.0666,
    annualRate: 0.48,
    catInformativePercent: 136.66,
    lifeInsuranceFortnightly: 0,
    lifeInsuranceCoverageMxn: 0,
    openingCommissionPercent: 0,
    requiresProofOfAddress: false,
    requiresCreditBureau: false,
    disbursementTime: "< 2 horas vía SPEI",
  },
];

export const REQUIREMENTS_DATA: RequirementItem[] = [
  {
    id: "req-id",
    title: "2 Copias de Identificación Oficial",
    description: "Credencial para votar (INE/IFE) vigente o Pasaporte mexicano vigente con fotografía clara y legible.",
    copies: 2,
    appliesTo: "all",
    icon: "id",
  },
  {
    id: "req-receipt",
    title: "1 Copia de Recibo de Nómina",
    description: "Último talón de pago quincenal donde se aprecie claramente el desglose de percepciones y deducciones.",
    copies: 1,
    appliesTo: "all",
    icon: "receipt",
  },
  {
    id: "req-proof",
    title: "1 Copia de Comprobante de Domicilio",
    description: "Recibo reciente de CFE, agua potable o impuesto predial no mayor a 3 meses de antigüedad.",
    copies: 1,
    appliesTo: "normal",
    icon: "home",
  },
];

export const FAQ_CHAT_PROMPTS = [
  {
    title: "¿Cuánto es lo máximo que me pueden descontar?",
    prompt: "¿Si gano $12,000 quincenales, cuánto es lo máximo que me pueden descontar por nómina?",
    answer: "Por política institucional de protección salarial y los lineamientos del Supremo Tribunal y Sindicato, el descuento quincenal máximo no excede el 35% de tu sueldo neto libre ($4,200 quincenales), garantizando siempre la solvencia de tu familia.",
  },
  {
    title: "¿Cuáles son los requisitos de contratación?",
    prompt: "¿Qué documentos necesito para solicitar un crédito de nómina?",
    answer: "El trámite es simplificado y sin complicaciones: sólo requieres 2 copias de tu Identificación Oficial (INE), 1 copia de tu último recibo de nómina, y para el Crédito Clásico (Normal), 1 comprobante de domicilio reciente. ¡Cero aval y cero buró tradicional!",
  },
  {
    title: "¿Cómo opera el seguro de vida incluido?",
    prompt: "¿Qué cobertura tiene el seguro de vida de mi crédito?",
    answer: "Tu Crédito Clásico incluye una póliza institucional de Seguro de Vida por $35,000.00 MXN ($22.85 quincenales ya integrados en tu cuota). En caso de siniestro, liquida en su totalidad el saldo deudor del préstamo y entrega el remanente en efectivo a tus beneficiarios designados.",
  },
  {
    title: "¿Tienen comisión por apertura?",
    prompt: "¿Cobran comisión por apertura o gastos de investigación?",
    answer: "¡Cero comisión por apertura! En Microfinanciera Cruse recibes el 100% del monto solicitado sin deducciones ocultas ni comisiones administrativas.",
  },
];

export const PRIVACY_NOTICE_LFPDPPP: PrivacyNoticeData = {
  documentId: "CRUSE-LFPDPPP-2026-V4",
  title: "Aviso de Privacidad Integral",
  subtitle: "Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)",
  lastUpdated: "Octubre 2026",
  legalFramework:
    "Artículos 15, 16, 17, 22, 28 y 36 de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP), su Reglamento, Lineamientos del INAI y disposiciones aplicables de la CONDUSEF y CNBV (Art. 95 Bis LGOAAC).",
  responsibleEntity: COMPANY_INFO.name,
  responsibleAddress: COMPANY_INFO.address,
  uneEmail: COMPANY_INFO.uneContact.email,
  unePhone: COMPANY_INFO.uneContact.phone,
  clauses: [
    {
      id: "responsable",
      number: "I",
      title: "Identidad y Domicilio del Responsable",
      content: `${COMPANY_INFO.name}, constituida conforme a las leyes mexicanas como Sociedad Financiera de Objeto Múltiple, Entidad No Regulada, con domicilio convencional para oír y recibir notificaciones en ${COMPANY_INFO.address}, es el Responsable del tratamiento, uso, almacenamiento y protección de sus datos personales, patrimoniales y financieros.`,
      highlights: [
        `Razón Social: ${COMPANY_INFO.name}`,
        `Domicilio Fiscal y Operativo: ${COMPANY_INFO.address}`,
        `Teléfono Institucional: ${COMPANY_INFO.officePhone} / Cel. ${COMPANY_INFO.cellPhone}`,
      ],
    },
    {
      id: "datos-recabados",
      number: "II",
      title: "Datos Personales y Patrimoniales Sometidos a Tratamiento",
      content:
        "Para el otorgamiento, originación y administración de créditos con descuento vía nómina gubernamental, recabamos: (1) Datos de identificación oficial (nombre completo, CURP, RFC, clave de elector INE/IFE, firma autógrafa); (2) Datos de contacto (domicilio particular, teléfono móvil para autenticación de doble factor 2FA vía SMS y correo electrónico); y (3) Datos laborales y patrimoniales (dependencia o convenio de adscripción, número de empleado, recibos de nómina quincenal, percepciones, deducciones y CLABE interbancaria para dispersión SPEI). No recabamos datos personales sensibles de salud, ideología o afiliación política.",
    },
    {
      id: "finalidades",
      number: "III",
      title: "Finalidades Primarias y Secundarias del Tratamiento",
      content:
        "Finalidades Primarias (necesarias para la relación jurídica): Verificar y confirmar su identidad; evaluar su capacidad real de pago bajo el tope institucional de protección salarial (máximo 35% del sueldo neto libre); formalizar el contrato de crédito de nómina y la póliza de seguro de vida asociada; ejecutar la dispersión de fondos vía SPEI; realizar la conciliación quincenal de retenciones ante la dependencia conveniada; y dar cumplimiento a las obligaciones de Prevención de Lavado de Dinero y Financiamiento al Terrorismo (PLD/FT) ante la CNBV conforme al Artículo 95 Bis de la LGOAAC. Finalidades Secundarias: Envío de notificaciones informativas sobre renovación o liquidación anticipada sin penalización.",
    },
    {
      id: "seguridad-cifrado",
      number: "IV",
      title: "Medidas de Seguridad Criptográfica y Protocolos Zero-PII",
      content:
        "En cumplimiento del artículo 19 de la LFPDPPP, sus documentos e información confidencial (INE, recibos de nómina, CURP y RFC) son protegidos mediante Cifrado de Sobre (Envelope Encryption AES-GCM de 256 bits con llaves DEK envueltas por KEK rotativas) tanto en tránsito como en reposo. Las búsquedas operativas se realizan mediante Blind Indexing criptográfico (HMAC-SHA256) sin desencriptar la base de datos. En capturas móviles de campo se aplica el protocolo Zero-PII Post-Ack (purga automática e irreversible de imágenes temporales en el dispositivo tras el acuse del servidor), y todo acceso queda asentado en una Bitácora Forense Inmutable (WORM con cadena Merkle SHA-256) con retención regulatoria de 5 años.",
      highlights: [
        "Cifrado en Reposo y Tránsito: AES-GCM-256 (Envelope Encryption KEK/DEK)",
        "Búsqueda Ciega sin Exposición: Blind Indexing HMAC-SHA256 para CURP y RFC",
        "Higiene en Dispositivos de Campo: Protocolo Zero-PII Post-Ack y Bitácora WORM SHA-256",
      ],
    },
    {
      id: "derechos-arco-une",
      number: "V",
      title: "Ejercicio de Derechos ARCO y Contacto de la Unidad Especializada (UNE)",
      content:
        "Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los utilizamos y las condiciones del uso que les damos (Acceso); solicitar la corrección de su información (Rectificación); que la eliminemos de nuestros registros cuando considere que no está siendo utilizada adecuadamente (Cancelación); así como oponerse al uso de sus datos para fines específicos (Oposición), o revocar su consentimiento. Para ejercer sus Derechos ARCO, deberá presentar su solicitud por escrito o vía electrónica ante nuestra Unidad Especializada de Atención a Usuarios (UNE) y Oficial de Cumplimiento, quien dará respuesta en un plazo máximo de 20 días hábiles conforme al artículo 32 de la LFPDPPP.",
      highlights: [
        `Atención UNE / Oficial de Cumplimiento: ${COMPANY_INFO.uneContact.title}`,
        `Correo Electrónico Oficial ARCO / UNE: ${COMPANY_INFO.uneContact.email}`,
        `Teléfonos UNE: ${COMPANY_INFO.uneContact.phone} (${COMPANY_INFO.businessHours})`,
      ],
    },
    {
      id: "supervision-condusef-inai",
      number: "VI",
      title: "Transferencias Legales, Supervisión CONDUSEF y Autoridad Garante",
      content:
        "Sus datos personales únicamente podrán ser transferidos sin requerir su consentimiento en los supuestos previstos por el artículo 37 de la LFPDPPP: a la dependencia o sindicato retenedor de nómina para la aplicación de descuentos autorizados, a la institución aseguradora para la cobertura del seguro de vida del crédito, y a las autoridades competentes (CNBV, SHCP/UIF y autoridades judiciales). Microfinanciera Cruse se encuentra debidamente registrada y supervisada ante la Comisión Nacional para la Protección y Defensa de los Usuarios de Servicios Financieros (CONDUSEF — Sistema SIPRES, www.condusef.gob.mx). En caso de considerar vulnerado su derecho a la protección de datos personales, puede acudir ante la autoridad garante nacional en materia de protección de datos.",
    },
  ],
};
