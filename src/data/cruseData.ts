/**
 * Fuente de Verdad Institucional de Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
 * Conforme a la Regla 2 (HRU) y Guardrails 2, 3 y 4 (CRUSE-APO-2026-051)
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
  qualityCertification: "Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.",
  primaryAgreements: [
    "Supremo Tribunal de Justicia del Estado de Chihuahua (Trabajadores Activos Sindicalizados y de Confianza)",
    "Sindicato de Trabajadores al Servicio del Gobierno del Estado (STSGECH) y Delegados Sindicales Municipales",
    "Agrupación de los Jubilados y Pensionados al Servicio de Gobierno del Estado de Chihuahua",
  ],
  unionOfficeContact: {
    title: "Atención a Trabajadores Sindicalizados — Departamento de Prestaciones Económicas",
    venueName: "Salón Pinos Altos (Sede Sindical STSGECH)",
    address: "Calle Laguna de Bustillos, Quinta Etapa San Felipe, C.P. 31203, Chihuahua, Chih.",
    phones: ["614 607 7301", "614 141 2503"],
  },
  uneContact: {
    title: "Titular de la Unidad Especializada de Atención a Usuarios (UNE) / Oficial de Cumplimiento",
    email: "gerardo.olvera@cruse.com.mx",
    phone: "(614) 411-15-44 / (614) 184-58-49",
    address: "Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.",
    city: "Chihuahua, Chihuahua",
  },
};

export const LOAN_PRODUCTS: LoanProduct[] = [
  {
    id: "normal",
    name: "Crédito Normal",
    tagline: "Financiamiento consolidado de mediano plazo para proyectos y patrimonio familiar",
    minAmount: 10000,
    maxAmount: 500000,
    terms: [24, 48, 72],
    monthlyTerms: [12, 24, 36],
    interestRateText: "1.9792% quincenal fija sin IVA (47.50% anual nominal)",
    annualRatePercentText: "47.50%",
    nominalRateFortnightly: 0.0197916667,
    nominalRateMonthly: 0.0395833333,
    annualRate: 0.475,
    catInformativePercent: 60.06,
    lifeInsuranceFortnightly: 22.85,
    lifeInsuranceCoverageMxn: 35000,
    openingCommissionPercent: 0,
    requiresProofOfAddress: true,
    requiresCreditBureau: false,
    disbursementTime: "< 24 horas posteriores a la firma de documentos Cruse",
  },
  {
    id: "express",
    name: "Crédito Express",
    tagline: "Liquidez inmediata descontada por nómina sin aval, con dispersión SPEI posterior a la firma de formatos",
    minAmount: 1000,
    maxAmount: 20000,
    terms: [6, 14, 20],
    monthlyTerms: [3, 7, 10],
    interestRateText: "3.3333% quincenal fija sin IVA (80.00% anual nominal)",
    annualRatePercentText: "80.00%",
    nominalRateFortnightly: 0.0333333333,
    nominalRateMonthly: 0.0666666667,
    annualRate: 0.80,
    catInformativePercent: 119.67,
    lifeInsuranceFortnightly: 0,
    lifeInsuranceCoverageMxn: 0,
    openingCommissionPercent: 0,
    requiresProofOfAddress: false,
    requiresCreditBureau: false,
    disbursementTime: "< 2 horas vía SPEI posteriores a la firma de documentos Cruse",
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
    description: "Último talón de pago donde se aprecie claramente el desglose de percepciones y deducciones.",
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
  {
    id: "req-formats",
    title: "Firma de Formatos Cruse y Autorización de Descuento",
    description: "Suscripción presencial de los Formatos Oficiales Cruse y la Carta de Autorización de Descuento de su Dependencia.",
    copies: 1,
    appliesTo: "all",
    icon: "signature",
  },
];

export const FAQ_CHAT_PROMPTS = [
  {
    title: "¿Cuánto es lo máximo que me pueden descontar?",
    prompt: "¿Si gano $12,000 quincenales, cuánto es lo máximo que me pueden descontar por nómina?",
    answer: "En estricto apego al Artículo 110 de la Ley Federal del Trabajo (LFT) y la política de protección salarial, el descuento periódico máximo jamás excede el 30% de tu sueldo neto libre ($3,600.00 quincenales para un ingreso neto de $12,000.00).",
  },
  {
    title: "¿Cuáles son los requisitos y dónde firmo?",
    prompt: "¿Qué documentos necesito y a dónde acudo a firmar mi solicitud?",
    answer: "Requieres 2 copias de INE vigente, 1 copia de tu último recibo de nómina, 1 comprobante de domicilio reciente (< 3 meses para Crédito Normal), y la firma de los Formatos Cruse más la Autorización de Descuento de tu Dependencia. Para indicarte tu sede exacta de firma, por favor indícanos: ¿en qué dependencia trabajas y eres trabajador sindicalizado (o jubilado/pensionado) o personal de confianza?",
  },
  {
    title: "¿Cómo opera el seguro de vida incluido?",
    prompt: "¿Qué cobertura tiene el seguro de vida de mi crédito?",
    answer: "Tu Crédito Normal (trabajadores activos) incluye una póliza institucional de Seguro de Vida por $35,000.00 MXN ($22.85 quincenales o $45.70 mensuales integrados en tu cuota). En caso de fallecimiento, liquida el saldo deudor del préstamo y entrega el remanente a tus beneficiarios designados.",
  },
  {
    title: "¿Cuándo se deposita mi crédito vía SPEI?",
    prompt: "¿En cuánto tiempo recibo mi transferencia y cobran comisión por apertura?",
    answer: "¡Cero comisión por apertura! Recibes el 100% del monto autorizado vía transferencia SPEI una vez recabadas las firmas autógrafas de tus Formatos Cruse y la Autorización de Descuento de tu Dependencia.",
  },
];

export const PRIVACY_NOTICE_LFPDPPP: PrivacyNoticeData = {
  documentId: "CRUSE-LFPDPPP-2026-V5",
  title: "Aviso de Privacidad Integral",
  subtitle: "Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)",
  lastUpdated: "Noviembre 2026",
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
        `Domicilio Fiscal y Operativo (y Domicilio de la UNE): ${COMPANY_INFO.address}`,
        `Teléfono Institucional: ${COMPANY_INFO.officePhone} / Cel. ${COMPANY_INFO.cellPhone}`,
      ],
    },
    {
      id: "datos-recabados",
      number: "II",
      title: "Datos Personales y Patrimoniales Sometidos a Tratamiento",
      content:
        "Para el otorgamiento, originación y administración de créditos con descuento vía nómina gubernamental, recabamos: (1) Datos de identificación oficial (nombre completo, CURP, RFC, clave de elector INE/IFE, firma autógrafa en Formatos Cruse y Autorización de Descuento); (2) Datos de contacto (domicilio particular, teléfono móvil para autenticación de doble factor 2FA vía SMS y correo electrónico); y (3) Datos laborales y patrimoniales (dependencia o convenio de adscripción, número de empleado, recibos de nómina, percepciones, deducciones y CLABE interbancaria para dispersión SPEI posterior a la firma contractual). No recabamos datos personales sensibles de salud, ideología o afiliación política.",
    },
    {
      id: "finalidades",
      number: "III",
      title: "Finalidades Primarias y Secundarias del Tratamiento",
      content:
        "Finalidades Primarias (necesarias para la relación jurídica): Verificar y confirmar su identidad; evaluar su capacidad real de pago bajo el límite legal de protección salarial (máximo 30% del sueldo neto libre conforme al Art. 110 de la Ley Federal del Trabajo); formalizar los formatos de crédito de nómina, la autorización de descuento de su dependencia y la póliza de seguro de vida asociada; ejecutar la dispersión de fondos vía SPEI posterior a la firma de documentos; realizar la conciliación periódica de retenciones ante la dependencia conveniada; y dar cumplimiento a las obligaciones de Prevención de Lavado de Dinero y Financiamiento al Terrorismo (PLD/FT) ante la CNBV conforme al Artículo 95 Bis de la LGOAAC. Finalidades Secundarias: Envío de notificaciones informativas sobre renovación o liquidación anticipada sin penalización.",
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
      title: "Ejercicio de Derechos ARCO y Domicilio de la Unidad Especializada (UNE)",
      content:
        `Usted tiene derecho a conocer qué datos personales tenemos de usted, para qué los utilizamos y las condiciones del uso que les damos (Acceso); solicitar la corrección de su información (Rectificación); que la eliminemos de nuestros registros cuando considere que no está siendo utilizada adecuadamente (Cancelación); así como oponerse al uso de sus datos para fines específicos (Oposición), o revocar su consentimiento. Para ejercer sus Derechos ARCO o presentar consultas y reclamaciones, deberá acudir o dirigir su solicitud a nuestra Unidad Especializada de Atención a Usuarios (UNE) ubicada físicamente en ${COMPANY_INFO.uneContact.address}, o vía electrónica, recibiendo respuesta en un plazo máximo de 20 días hábiles conforme al artículo 32 de la LFPDPPP.`,
      highlights: [
        `Atención UNE / Oficial de Cumplimiento: ${COMPANY_INFO.uneContact.title}`,
        `Domicilio Físico UNE: ${COMPANY_INFO.uneContact.address}`,
        `Correo Electrónico Oficial ARCO / UNE: ${COMPANY_INFO.uneContact.email}`,
        `Teléfonos UNE: ${COMPANY_INFO.uneContact.phone} (${COMPANY_INFO.businessHours})`,
      ],
    },
    {
      id: "supervision-condusef-inai",
      number: "VI",
      title: "Transferencias Legales, Supervisión CONDUSEF y Autoridad Garante",
      content:
        "Sus datos personales únicamente podrán ser transferidos sin requerir su consentimiento en los supuestos previstos por el artículo 37 de la LFPDPPP: a la dependencia, sindicato o agrupación retenedora de nómina para la aplicación de descuentos autorizados, a la institución aseguradora para la cobertura del seguro de vida del crédito, y a las autoridades competentes (CNBV, SHCP/UIF y autoridades judiciales). Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R. se encuentra debidamente registrada y supervisada ante la Comisión Nacional para la Protección y Defensa de los Usuarios de Servicios Financieros (CONDUSEF — Sistema SIPRES, www.condusef.gob.mx). En caso de considerar vulnerado su derecho a la protección de datos personales, puede acudir ante la autoridad garante nacional en materia de protección de datos.",
    },
  ],
};
