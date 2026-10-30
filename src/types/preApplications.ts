/**
 * CONTRATOS DE TIPOS PARA PRE-SOLICITUDES DEL SIMULADOR PÚBLICO Y BUZÓN CIFRADO
 *
 * @implements CRUSE-APO-2026-045
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 6 SQA (TypeScript Estricto)
 */

import { ProductId } from './index';

export type PreApplicationInboxStatus = 'NO_LEIDO' | 'LEIDO' | 'ATENDIDO';

export interface PreApplicationPublicSubmitPayload {
  folio: string;
  fullName: string;
  phone: string;
  email: string;
  convenio: string;
  preferredSchedule?: string;
  productId: ProductId;
  productName: string;
  amount: string;
  selectedTerm: number;
  fortnightlyPayment: string;
  monthlyPaymentEquivalent: string;
  totalToPay: string;
  catPercent: string;
  interestRateText: string;
}

export interface PreApplicationSummaryItem {
  id: string;
  folio: string;
  createdAt: string;
  applicantNameMasked: string;
  phoneMasked: string;
  emailMasked: string;
  convenio: string;
  productId: ProductId;
  productName: string;
  requestedAmountMxn: string;
  termFortnights: number;
  fortnightlyPaymentMxn: string;
  monthlyPaymentMxn: string;
  totalToPayMxn: string;
  catPercent: string;
  interestRateText: string;
  inboxStatus: PreApplicationInboxStatus;
  readByEmail: string | null;
  readAt: string | null;
  attendedByEmail: string | null;
  attendedAt: string | null;
  promoterNotes: string | null;
}

export interface PreApplicationDecryptedDetail extends PreApplicationSummaryItem {
  fullName: string;
  phone: string;
  email: string;
  preferredSchedule: string;
}

export interface PreApplicationsInboxCounts {
  total: number;
  unreadCount: number;
  readCount: number;
  attendedCount: number;
}

export interface PreApplicationsInboxOverview {
  counts: PreApplicationsInboxCounts;
  items: PreApplicationSummaryItem[];
}
