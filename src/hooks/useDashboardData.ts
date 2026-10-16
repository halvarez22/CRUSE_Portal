import { useState, useEffect } from 'react';
import { DashboardKPIs, LatestLoan, ExpedientDetails } from '../types/dashboard';

export function useDashboardData() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [latestLoans, setLatestLoans] = useState<LatestLoan[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [loansLoading, setLoansLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);
  const [loansError, setLoansError] = useState<string | null>(null);

  const fetchWithAuth = async (url: string) => {
    const token = localStorage.getItem('auth_token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { headers });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (contentType.includes('application/json')) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Error fetching ${url}: ${res.statusText}`);
      }
      throw new Error(`Error fetching ${url}: ${res.status} ${res.statusText}`);
    }
    if (!contentType.includes('application/json')) {
      throw new Error(`Respuesta inválida del servidor en ${url} (se esperaba JSON y se recibió ${contentType || 'contenido no-JSON'})`);
    }
    return res.json();
  };

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setKpisLoading(true);
      setLoansLoading(true);
      setKpisError(null);
      setLoansError(null);

      const [kpisResult, loansResult] = await Promise.allSettled([
        fetchWithAuth('/api/dashboard/kpis'),
        fetchWithAuth('/api/dashboard/latest_loans')
      ]);

      if (!mounted) return;

      if (kpisResult.status === 'fulfilled') {
        setKpis(kpisResult.value);
      } else {
        const message = kpisResult.reason instanceof Error ? kpisResult.reason.message : 'Error loading KPIs';
        setKpisError(message);
      }
      setKpisLoading(false);

      if (loansResult.status === 'fulfilled') {
        setLatestLoans(loansResult.value);
      } else {
        const message = loansResult.reason instanceof Error ? loansResult.reason.message : 'Error loading loans';
        setLoansError(message);
      }
      setLoansLoading(false);
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const fetchExpedientDetails = async (id: string): Promise<ExpedientDetails> => {
    return fetchWithAuth(`/api/dashboard/expedientes/${id}/details`);
  };

  const error = kpisError || loansError;

  return {
    kpis,
    latestLoans,
    kpisLoading,
    loansLoading,
    kpisError,
    loansError,
    error,
    fetchExpedientDetails
  };
}

