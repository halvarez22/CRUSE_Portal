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
    if (!res.ok) {
      throw new Error(`Error fetching ${url}: ${res.statusText}`);
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

