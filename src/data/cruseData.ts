/**
 * Fuente de Verdad Institucional de Microfinanciera Cruse SOFOM E.N.R.
 * Conforme a la Regla 2 (HRU) — Cero textos o catálogos quemados inline en componentes.
 */
import { CompanyInfo, LoanProduct, RequirementItem } from '../types';

export const COMPANY_INFO: CompanyInfo = {
  name: "Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.",
  shortName: "Microfinanciera Cruse",
  tagline: "Un modelo ágil, seguro y sin fricciones para instituciones afiliadas",
  foundedYear: 2010,
  hqCity: "Chihuahua, Chihuahua",
  address: "Vía Citadela #5710 Interior #401, Edificio Quorum, Col. Saucito, CP 31110, Chihuahua, Chih.",
  officePhone: "(614) 411-15-44",
  cellPhone: "(614) 184-58-49",
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
