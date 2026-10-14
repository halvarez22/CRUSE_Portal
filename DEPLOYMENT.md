# 🚀 GUÍA DE DESPLIEGUE EN PRODUCCIÓN — CRUSE FINTECH PORTAL
## Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
**Expediente:** CRUSE-APO-2026-005  
**Estándar Normativo:** CNBV (Art. 95 Bis LGOAAC) & LFPDPPP  

---

## 1. REQUISITOS DEL SISTEMA

| Componente | Requisito Mínimo | Recomendado Producción |
| :--- | :--- | :--- |
| **Sistema Operativo** | Ubuntu 22.04 LTS / Debian 12 | Ubuntu 24.04 LTS Server |
| **Runtime** | Node.js v22.0+ (LTS) | Node.js v22.19+ |
| **Base de Datos** | PostgreSQL 15+ (o SQLite WAL para pruebas) | PostgreSQL 16 con SSL y Backups WAL |
| **Servidor Web / Proxy** | Nginx 1.22+ con soporte TLS 1.3 | Nginx con Certbot Let's Encrypt / Cloudflare |
| **Almacenamiento WORM** | Disco local con permisos restringidos | AWS S3 con **Object Lock** (Compliance Mode) |

---

## 2. VARIABLES DE ENTORNO EN PRODUCCIÓN (`.env`)

Cree un archivo `.env` en la raíz del proyecto (protegido por `.gitignore`, permisos `chmod 600 .env`):

```bash
# Entorno y Puerto
NODE_ENV=production
PORT=3000

# Base de Datos Relacional de Producción (PostgreSQL)
DATABASE_URL=postgresql://cruse_app:SuperPasswordSeguro2026!@postgres-db.internal:5432/cruse_fintech?sslmode=require

# Llave Maestra KEK para Envelope Encryption (AES-256 Hex)
# Generar con: openssl rand -hex 32
CRUSE_MASTER_KEK_V1=4a8f9c1b7e2d5a3f8c0e2b4d6f8a1c3e5b7d9f0a2c4e6b8a0d2f4a6c8e0b2d4f

# Clave Secreta para Blind Indexing (HMAC-SHA256)
# Generar con: openssl rand -hex 32
BLIND_INDEX_SECRET=9e3b8a1c5d7f2e0b4a6c8d0f2a4e6b8c0e2d4f6a8b0c2e4d6f8a0b2c4e6d8f0a

# Inteligencia Artificial Groq (Llama 3.3 70B Zero-PII)
GROQ_API_KEY=gsk_TuClaveOficialDeGroqEnProduccion

# Token Secreto para Sesiones JWT / Cookies Seguras
JWT_SECRET=f7e3d1c9b5a2f8e4c0d6a3b7f1e5d9c2b8a4f0e6d2c8a4b0e6f2d8c4b0a6f2e8
```

---

## 3. INSTALACIÓN Y CONSTRUCCIÓN

```bash
# 1. Clonar repositorio
git clone https://github.com/halvarez22/CRUSE_FINTECH.git
cd CRUSE_FINTECH/cruse-fintech-portal

# 2. Instalar dependencias exactas
npm ci

# 3. Verificación de Tipos Estrictos (Regla 6 SQA)
npm run lint

# 4. Compilación del Frontend y Bundle de Producción
npm run build
```

---

## 4. INICIALIZACIÓN DE BASE DE DATOS Y WORM NATIVO

Las migraciones relacionales se ejecutan automáticamente al arrancar el servidor mediante `migrationRunner.ts`:
1. Verifica los checksums SHA-256 de todas las migraciones previas.
2. Aplica las tablas `audit_events`, `expedientes`, `reconciliation_batches` y `reconciliation_items`.
3. Activa los triggers ineludibles que abortan sentencias `UPDATE` y `DELETE` sobre la bitácora regulatoria de 5 años.

Para forzar la ejecución manual de migraciones sin levantar el servidor HTTP:
```bash
npx tsx -e "import { runMigrations } from './src/services/db/migrationRunner'; runMigrations().then(console.log);"
```

---

## 5. CONFIGURACIÓN DEL SERVICIO SYSTEMD (LINUX)

Cree el archivo `/etc/systemd/system/cruse-portal.service`:

```ini
[Unit]
Description=Cruse Fintech Secure Portal & Core Engine
After=network.target postgresql.service

[Service]
Type=simple
User=cruse-svc
WorkingDirectory=/var/www/cruse-fintech-portal
EnvironmentFile=/var/www/cruse-fintech-portal/.env
ExecStart=/usr/bin/node dist/server.cjs
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=cruse-portal

[Install]
WantedBy=multi-user.target
```

Habilitar e iniciar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cruse-portal
sudo systemctl start cruse-portal
sudo systemctl status cruse-portal
```

---

## 6. CONFIGURACIÓN DE REVERSE PROXY NGINX (SSL TLS 1.3)

Cree `/etc/nginx/sites-available/portal.cruse.com.mx`:

```nginx
server {
    listen 80;
    server_name portal.cruse.com.mx;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal.cruse.com.mx;

    ssl_certificate /etc/letsencrypt/live/portal.cruse.com.mx/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.cruse.com.mx/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Encabezados de Seguridad Grado Bancario
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Límite de carga para INE y documentos de campo
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 7. POLÍTICA DE BACKUPS INMUTABLES (S3 OBJECT LOCK)

Conforme a la regulación CNBV (retención obligatoria de 5 años para bitácoras PLD/FT):
1. Configure un bucket de AWS S3 en modo **Object Lock** con retención legal en modo **Compliance**.
2. Programe un cron diario a las 02:00 hrs para exportar la base de datos PostgreSQL cifrada:
```bash
0 2 * * * /var/www/cruse-fintech-portal/scripts/backup_worm_s3.sh
```
El modo Compliance garantiza que **ni el usuario root de AWS ni ningún atacante** puede borrar o modificar los registros antes del periodo de retención legal de 5 años.

---

## 8. MONITOR DE SALUD & HEALTHCHECK

El balanceador de carga o monitor uptime debe sondear periódicamente:
```http
GET http://127.0.0.1:3000/api/health
```
Respuesta esperada (HTTP 200):
```json
{
  "status": "ok",
  "company": "Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.",
  "aiModel": "llama-3.3-70b-versatile",
  "timestamp": "2026-10-06T12:00:00.000Z"
}
```
