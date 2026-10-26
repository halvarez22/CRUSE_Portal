import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from './hooks/useTheme';
import { HeaderNavbar } from './components/common/HeaderNavbar';
import { HeroPedestalSection } from './components/public/HeroPedestalSection';
import { PublicCreditSimulator } from './components/public/PublicCreditSimulator';
import { RequirementsGlassSlabs } from './components/public/RequirementsGlassSlabs';
import { OperationalPhases } from './components/public/OperationalPhases';
import { InstitutionalAlliance } from './components/public/InstitutionalAlliance';
import { AiAssistantPublic } from './components/public/AiAssistantPublic';
import { ContactEcosystemSlab } from './components/public/ContactEcosystemSlab';
import { FooterPublic } from './components/public/FooterPublic';
import { Login2FAModal } from './components/auth/Login2FAModal';
import { PromotorScannerView } from './components/promotor/PromotorScannerView';
import { AdminAuditView } from './components/admin/AdminAuditView';
import { AuthSession } from './types';
import { ShieldCheck, UserCheck } from 'lucide-react';

const STORAGE_ACCESS_TOKEN = 'auth_token';
const STORAGE_REFRESH_TOKEN = 'auth_refresh_token';
const STORAGE_REFRESH_EXPIRES_AT = 'auth_refresh_expires_at';

function clearPersistentSessionStorage(): void {
  localStorage.removeItem(STORAGE_ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_REFRESH_EXPIRES_AT);
}

function persistSessionStorage(sess: AuthSession): void {
  localStorage.setItem(STORAGE_ACCESS_TOKEN, sess.token);
  if (sess.refreshToken) {
    localStorage.setItem(STORAGE_REFRESH_TOKEN, sess.refreshToken);
  }
  if (sess.refreshExpiresAt) {
    localStorage.setItem(STORAGE_REFRESH_EXPIRES_AT, sess.refreshExpiresAt);
  }
}

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [show2FaModal, setShow2FaModal] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [currentView, setCurrentView] = useState<'public' | 'private'>('public');

  const rotatePersistentSession = useCallback(async (openPrivateOnRestore = false) => {
    const storedRefreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);
    const storedRefreshExpiresAt = localStorage.getItem(STORAGE_REFRESH_EXPIRES_AT);

    if (!storedRefreshToken) return;

    if (storedRefreshExpiresAt) {
      const expMs = Date.parse(storedRefreshExpiresAt);
      if (Number.isNaN(expMs) || expMs <= Date.now()) {
        clearPersistentSessionStorage();
        setSession(null);
        setCurrentView('public');
        return;
      }
    }

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedRefreshToken}`,
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        clearPersistentSessionStorage();
        setSession(null);
        setCurrentView('public');
        return;
      }

      const data = await res.json();
      const restoredSession: AuthSession = {
        user: data.user,
        token: data.token,
        expiresAt: data.expiresAt,
        refreshToken: data.refreshToken,
        refreshExpiresAt: data.refreshExpiresAt,
      };
      persistSessionStorage(restoredSession);
      setSession(restoredSession);
      if (openPrivateOnRestore) {
        setCurrentView('private');
      }
    } catch {
      // Fallo transitorio de red: conserva estado actual sin purgar hasta respuesta explícita 401.
    }
  }, []);

  // Restauración automática al abrir el Portal dentro de la ventana de 8 horas (sin pedir contraseña ni SMS)
  useEffect(() => {
    void rotatePersistentSession(false);
  }, [rotatePersistentSession]);

  // Rotación silenciosa cada 10 minutos mientras la sesión persistente de 8 horas siga vigente
  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      void rotatePersistentSession(false);
    }, 10 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [session, rotatePersistentSession]);

  // Si el usuario está autenticado y desea ver su módulo privado
  if (session && currentView === 'private') {
    if (session.user.role === 'promotor') {
      return (
        <PromotorScannerView
          session={session}
          onBackToPortal={() => setCurrentView('public')}
        />
      );
    }

    return (
      <AdminAuditView
        session={session}
        onLogout={() => {
          const currentAccessToken = session.token;
          clearPersistentSessionStorage();
          setSession(null);
          setCurrentView('public');
          void fetch('/api/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentAccessToken}` },
          }).catch(() => undefined);
        }}
        onBackToPortal={() => setCurrentView('public')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#030914] text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-[#249E82] selection:text-white transition-colors duration-300 relative overflow-x-hidden">
      {/* Background Ambient Glowing Orbs (Neutralizados en Modo Claro conforme a Guardrail 3; intactos en Modo Oscuro) */}
      <div className="fixed top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full bg-[#041734] opacity-0 dark:opacity-60 blur-[130px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed top-[25%] right-[-10%] w-[550px] h-[550px] rounded-full bg-[#1E9F81] opacity-0 dark:opacity-20 blur-[150px] pointer-events-none -z-10 gpu-accelerated" />
      <div className="fixed bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-[#396CAE] opacity-0 dark:opacity-25 blur-[160px] pointer-events-none -z-10 gpu-accelerated" />

      {/* Barra de estado si hay sesión activa pero el usuario está viendo el portal público */}
      {session && (
        <div className="bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white py-1.5 px-4 text-xs font-semibold flex items-center justify-between sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            <span>Sesión 2FA Activa (8h): {session.user.name} ({session.user.role.replace('_', ' ').toUpperCase()})</span>
          </div>
          <button
            onClick={() => setCurrentView('private')}
            className="px-3 py-0.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-all text-xs font-bold flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Abrir Mi Módulo Privado</span>
          </button>
        </div>
      )}

      {/* Sticky Master Header Navigation */}
      <HeaderNavbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenInstitutionalAccess={() => {
          if (session) {
            setCurrentView('private');
          } else {
            setShow2FaModal(true);
          }
        }}
      />

      {/* Main Public Content */}
      <main className="space-y-4 pt-24">
        <HeroPedestalSection />
        <PublicCreditSimulator />
        <RequirementsGlassSlabs />
        <OperationalPhases />
        <InstitutionalAlliance />
        <AiAssistantPublic />
        <ContactEcosystemSlab />
      </main>

      {/* Footer with Regulatory Seals */}
      <FooterPublic />

      {/* Modal Institucional 2FA vía Código SMS con Rate Limiting Anti-SMS-Pumping */}
      <Login2FAModal
        isOpen={show2FaModal}
        onClose={() => setShow2FaModal(false)}
        onLoginSuccess={(newSession) => {
          persistSessionStorage(newSession);
          setSession(newSession);
          setCurrentView('private');
        }}
      />
    </div>
  );
}
