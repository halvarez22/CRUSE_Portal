# 📘 MANUAL DE OPERACIÓN PARA LA UNIDAD ESPECIALIZADA (UNE) Y CUMPLIMIENTO REGULATORIO
## Microfinanciera Cruse, S.A. de C.V. SOFOM E.N.R.
**Destinatario:** Lic. Gerardo Olvera — Titular de la UNE y Oficial de Cumplimiento  
**Expediente:** CRUSE-APO-2026-005  
**Marco Legal:** Art. 95 Bis LGOAAC (CNBV PLD/FT), Disposiciones CONDUSEF y LFPDPPP  

---

## I. INTRODUCCIÓN Y ALCANCE

El presente manual establece los protocolos operativos y forenses para la administración del Portal Seguro de Microfinanciera Cruse. Como Oficial de Cumplimiento, usted cuenta con facultades exclusivas para auditar la trazabilidad inmutable de las operaciones, certificar la integridad criptográfica de la base de datos y autorizar los lotes quincenales de retención de nómina.

---

## II. ACCESO SEGURO CON AUTENTICACIÓN DE DOS FACTORES (2FA TOTP)

Para acceder a la consola administrativa de Cumplimiento:
1. Ingrese al Portal Web (`https://portal.cruse.com.mx` o `http://localhost:3000`).
2. En la barra superior, presione el botón **"Acceso Seguro 2FA"**.
3. Ingrese sus credenciales institucionales:
   - **Correo:** `gerardo.olvera@cruse.com.mx`
   - **Contraseña:** `Cruse2026!Oficial`
4. Introduzca el código numérico de 6 dígitos generado en su aplicación de autenticación (Google Authenticator, Microsoft Authenticator o 1Password).
5. El sistema emite un token de sesión con caducidad automática y registra el evento `LOGIN_2FA_SUCCESS` en la bitácora inmutable.

> [!NOTE]
> La consola cuenta con un limitador de intentos (Rate Limiter). Tras 5 intentos erróneos, la dirección IP se bloquea temporalmente por 15 minutos para salvaguardar el sistema contra ataques de fuerza bruta.

---

## III. AUDITORÍA FORENSE Y VERIFICACIÓN DE INTEGRIDAD WORM (SHA-256)

Conforme a la regulación CNBV, todos los movimientos críticos (`EXPEDIENTE_CREATE`, `EXPEDIENTE_SYNC`, `EXPEDIENTE_PURGE`, `RECONCILIATION_BATCH_SEALED`) se asientan en la tabla `audit_events`.

### 1. Inmutabilidad por Diseño
La base de datos cuenta con **Triggers WORM Nativos a nivel de motor**. Cualquier intento de modificar (`UPDATE`) o borrar (`DELETE`) un registro de auditoría es abortado físicamente por el motor de base de datos con el mensaje:
> *"VIOLACIÓN FATAL DE INTEGRIDAD WORM: La bitácora forense de Microfinanciera Cruse es estrictamente inmutable."*

### 2. Verificación de la Cadena Merkle
1. Ingrese a la pestaña **"Bitácora Forense Inmutable"**.
2. Presione el botón verde **"Verificar Integridad SHA-256"**.
3. El sistema recalcula matemáticamente el hash de cada bloque:
   $$\text{recordHash}_i = \text{SHA-256}(\text{prevHash}_{i-1} \parallel \text{timestamp} \parallel \text{actor} \parallel \text{action} \parallel \dots)$$
4. Si la cadena está 100% íntegra, el sistema emitirá el sello verde:
   `✅ Certificación de Integridad Forense Exitosa: Cadena de 100% registros verificada criptográficamente.`

---

## IV. MOTOR DE CONCILIACIÓN QUINCENAL AUTOMATIZADO

El motor de conciliación quincenal sustituye formalmente el cruce manual en hojas de Excel, eliminando el riesgo de errores aritméticos y cartera vencida oculta.

### 1. Carga de Dispersión de Nómina
1. Ingrese a la pestaña **"Conciliación Quincenal"**.
2. Seleccione el **Convenio Colectivo**:
   - `Gobierno Chihuahua (STSGECH)`
   - `Supremo Tribunal de Justicia`
3. Seleccione el **Periodo Quincenal** correspondiente (ej. `2026-10-1Q`).
4. Cargue el archivo de dispersión remitido por la dependencia o utilice la carga automatizada de nómina.

### 2. Ejecución del Cruce Dinámico
Presione el botón **"Ejecutar Conciliación Automatizada"**. En milisegundos, el motor:
- Aplica **Blind Indexing HMAC-SHA256** para identificar los expedientes sin desencriptar CURPs.
- Calcula con `decimal.js` la cuota exacta de amortización ($569.44 para $10,000 MXN a 24q Normal).
- Clasifica cada partida en la **Matriz de 4 Estados**:

| Estado | Significado Operativo | Acción del Oficial |
| :--- | :--- | :--- |
| **`MATCH_EXACT`** | Retención recibida cubre 100% de la cuota. | El sistema actualiza el crédito a `conciliado` automáticamente. |
| **`DISCREPANCY_UNDERPAYMENT`** | Descuento incompleto (ej. $300 recibidos vs $569.44 esperados). | Se aplica cascada regulatoria: Seguro de Vida ($22.85) -> Interés -> IVA -> Capital. Notificar al promotor. |
| **`MISSING_IN_PAYROLL`** | **Alerta Roja:** Crédito activo ausente en la nómina del convenio. | Investigar baja laboral inmediata con Recursos Humanos del Gobierno o Supremo Tribunal. |
| **`DISCREPANCY_OVERPAYMENT`** | Retención recibida mayor a la cuota calculada. | Registrar saldo a favor para bonificación en la siguiente quincena. |

---

## V. GENERACIÓN DE ACTAS OFICIALES Y LAYOUTS SIF / CIB

Una vez concluido el proceso:
1. **Acta Firmada Oficial (CNBV / CONDUSEF):**
   - Presione **"Acta Firmada (.txt)"**.
   - El documento incluye el **Sello Manifiesto SHA-256** del lote y el bloque de firmas formales de la UNE y Dirección General.
2. **Layout para Logic Systems (SIF / CIB):**
   - Presione **"Layout SIF/CIB (.csv)"**.
   - Se descarga el archivo estandarizado listo para inyección automática en el sistema central de cartera.

---

## VI. ATENCIÓN A REQUERIMIENTOS REGULATORIOS

Ante una solicitud de auditoría de la CNBV, CONDUSEF o INAI:
1. Genere la verificación criptográfica SHA-256 en tiempo real.
2. Exporte la bitácora forense de los últimos 5 años.
3. Adjunte las actas de conciliación selladas con su respectivo identificador `batchManifestHash`.
4. El portal garantiza el cumplimiento total de los estándares de protección de datos (LFPDPPP) al no exponer PII en claro.
