import { DelinquencySemaphore, HubRegion } from './executive';

export interface HubMetricsSummary {
  hubRegion: HubRegion;
  loansCount: number;
  capitalColocado: number;
  capitalVigente: number;
  carteraVencida: number;
  semaphoreCounts: {
    VERDE: number;
    AMARILLO: number;
    ROJO: number;
  };
}

export interface DashboardKPIs {
  capitalColocado: number;
  capitalVigente: number;
  creditosActivos: number;
  carteraVencida: number;
  semaphoreCounts?: {
    VERDE: number;
    AMARILLO: number;
    ROJO: number;
  };
  hubBreakdown?: Record<HubRegion, HubMetricsSummary>;
}

export interface LatestLoan {
  id: string;
  convenio?: string;
  hubRegion?: HubRegion;
  fullName: string;
  curpMasked: string;
  curp?: string;
  amount: number;
  payment?: number;
  termFortnights?: number;
  status: 'capturado' | 'conciliado' | 'aprobado' | 'rechazado' | 'activo' | 'liquidado';
  semaphore?: DelinquencySemaphore;
  daysPastDue?: number;
  date: string;
  productType: 'normal' | 'express' | 'especial';
}

export interface ExpedientDetails {
  id: string;
  fullName: string;
  curp: string; // Unmasked PII
  rfc: string;  // Unmasked PII
  address: string;
  phone: string;
  voterId: string;
  productType: string;
  requestedAmount: number;
  termFortnights: number;
  status: string;
  createdAt: string;
}
