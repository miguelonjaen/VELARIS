# VELARIS — Conectividad universal, vinculación permanente y sincronización

**Fase 0: auditoría y especificación.** Fecha de la auditoría: 13/10/2026.
Este documento no cambia código funcional. Complementa `ARQUITECTURA_CONECTIVIDAD_SINCRONIZACION.md` (raíz de VELARIS) y `VELARIS-Link/PROTOCOL.md`.

Convención de estado usada en todo el documento:

| Marca | Significado |
|---|---|
| **EXISTE** | Está en el código inspeccionado. |
| **TEST** | Cubierto por pruebas automáticas (unitarias, integración con el servidor Node real o simulador). |
| **REAL** | Observado en el OPPO CPH2637 con Desktop real. Solo lo que el usuario confirmó. |
| **NO** | No implementado. |
| **NO VERIFICADO** | No he podido comprobarlo; no se afirma. |

---

## 1. Inventario de componentes y comunicaciones

### 1.1 Componentes (rutas reales)

| Componente | Ruta | Tecnología | Papel en Link |
|---|---|---|---|
| VELARIS Desktop | `C:\PROYECTO GAULOS\VELARIS` | Electron + React/TS + Vite | **Servidor** de Link (`link/`), mapa, bitácora, instrumentos |
| VELARISdroid | `C:\PROYECTO GAULOS\VELARISdroid` | Kotlin + Compose | **Cliente** de Link (`core/link/`), GPS, tracks |
| VELARISGT6 | `C:\PROYECTO GAULOS\VELARISGT6` | HarmonyOS (JS) | Reloj; habla con Android por Wear Engine, **no** con Link ni con Desktop |
| Contrato Link | `C:\PROYECTO GAULOS\VELARIS-Link` | `PROTOCOL.md` + `fixtures/` | Especificación y vectores compartidos Desktop↔Android |
| SmartCHARTS | `C:\PROYECTO GAULOS\Smartcharts` | — | Aparcado |

### 1.2 Módulos de Link

**Desktop (`VELARIS/link/`)**

| Archivo | Responsabilidad |
|---|---|
| `protocol.js` | Constantes, creación y validación de mensajes, prueba HMAC |
| `linkStore.js` | Persistencia: `identity.json`, `devices.json` (token cifrado), `settings.json`, tracks, cursores |
| `linkServer.js` | Servidor WebSocket (`ws`), beacon UDP, pairing, sesiones, ACK |
| `linkMain.js` | Integración Electron (IPC, arranque si `settings.enabled`) |
| `tools/simulate-phone.js` | Simulador de teléfono (datos marcados `src:"simulation"`) |

**Android (`core/link/`)**

| Archivo | Responsabilidad |
|---|---|
| `LinkProtocol.kt` | Contrato Kotlin y validación |
| `LinkClient.kt` | Cliente OkHttp: sesión, reintentos, ruta de red, diagnóstico |
| `LinkManager.kt` | Singleton: callbacks de red, descubrimiento, estado para la UI |
| `LinkCredentials.kt` | Token cifrado con Android Keystore (AES-GCM), endpoint, IP de VPN |
| `LinkDiscovery.kt` | Escucha del beacon UDP |
| `TrackJournal.kt` | Diario append-only (`points.jsonl`, `meta.json`) con cursores |
| `LinkSyncEngine.kt` | Decisiones de sincronización (lotes, ventana, ACK) |

### 1.3 Comunicaciones existentes

| Canal | Origen → destino | Transporte | Estado |
|---|---|---|---|
| Link v1 | Android → Desktop | WebSocket `ws://` TCP **47811** | EXISTE, TEST |
| Descubrimiento | Desktop → LAN | UDP broadcast **47812**, cada 2 s | EXISTE, TEST |
| Reloj | Reloj ↔ Android | Wear Engine (Huawei) | EXISTE en `WatchScreen.kt`, `WatchAlertEvaluator.kt`, `wearengine.js`; fuera de este alcance |
| Nube | Desktop ↔ Supabase | HTTPS + Realtime (`postgres_changes`) | EXISTE en Desktop; **Android no tiene cliente Supabase** |
| Datos náuticos | Instrumentos → Desktop | NMEA/AIS (UDP/TCP) | EXISTE; **no viaja por Link** (decisión de `PROTOCOL.md`) |
| VPN (provisional) | Android → Desktop | `ws://` sobre Tailscale | EXISTE desde hoy (ver §2.4); sin probar en dispositivos |

---

## 2. Estado real de VELARIS Link y de la reconexión

### 2.1 Protocolo

Handshake por sesión: `HELLO → CHALLENGE(nonce) → AUTH(prueba) → WELCOME → SYNC_REQUEST/SYNC_STATE`.
La prueba es `HMAC-SHA256(token, "VLINK1|nonce|desktopId|deviceId")`. El token **nunca se reenvía** tras el emparejamiento. TEST (vector común en `fixtures/auth-vector.json`).

Mensajes: beacon, HELLO, CHALLENGE, AUTH, WELCOME, PAIR_*, HEARTBEAT (5 s, obsoleto a los 15 s), POSITION (efímero, sin ACK), TRACK_START/UPDATE/END, TRACK_POINTS (≤200), LOG_EVENT, ACK, SYNC_*, ERROR, BYE.

### 2.2 Sincronización

| Garantía | Mecanismo | Estado |
|---|---|---|
| Puntos no se pierden | Android escribe el diario antes de enviar; no se borra al recibir ACK | EXISTE, TEST |
| Confirmar tras guardar | Desktop responde ACK después de fsync, con la secuencia contigua | EXISTE, TEST |
| Sin duplicados | Idempotencia por `(trackId, seq)` y `eventId` | EXISTE, TEST |
| Reanudar | `SYNC_REQUEST/SYNC_STATE` + cursor por escritorio (`sync/<desktopId>.json`) | EXISTE, TEST |
| Entrega | **Al menos una vez** con deduplicación en destino. No se afirma «exactamente una vez». | — |

### 2.3 Reconexión: qué se ha demostrado

Hechos:

1. **El fallo reproducido el 13/10 no era un fallo del protocolo ni de los reintentos.** El log del OPPO mostraba origen `192.168.1.142` y destino `192.168.11.173`: tras apagar y encender la Wi‑Fi, el teléfono se había unido a **otra red**. El PC tiene una sola interfaz activa (Ethernet `192.168.11.173/24`), escucha en `192.168.11.173:47811` y `127.0.0.1:47811`, y sus reglas de firewall de Electron/Node/velaris.exe son *Allow* (perfil Público). El usuario confirmó que se había conectado a otra Wi‑Fi. **REAL.**
2. **Con el teléfono de vuelta en la misma Wi‑Fi, vuelve a conectar «en pocos segundos».** Observación manual del usuario, **sin medición** y una sola vez. **REAL (parcial).**
3. Antes de ese fallo, el log de Desktop ya mostraba ciclos Conectado/Desconectado del OPPO. **REAL.**

Cambios aplicados durante el diagnóstico (en el código, no en el protocolo ni en el pairing):

- Cada intento elige de nuevo la red (`NetworkRoute`/`socketFactory` de la Wi‑Fi cuya subred contiene al PC) y tiene timeout de conexión de 5 s.
- Callback de red Wi‑Fi (sin exigir Internet): al aparecer una red, reintenta de inmediato.
- `networkLost()` cierra el socket y programa el reintento (antes solo registraba).
- Diagnóstico inequívoco (`SIN_RUTA_WIFI`, `CONNECT_START … vía …`, `WS_OPEN`, `WS_TIMEOUT`, `AUTH_REJECTED`, `RETRY_*`) en logcat (`VELARIS_LINK`) y en la tarjeta de la pantalla Link. Desktop registra «Conexión TCP entrante de …».
- Backoff de reintento: 1, 2, 4, 8 y 15 s (tope). **Sin jitter**.

**No demostrado:** que el cambio de ruta por `socketFactory` sea necesario (en el caso real el socket ya salía por la Wi‑Fi). La hipótesis de la red de datos móviles como red por defecto sigue **sin probarse**: ADB no detectó el teléfono (modo almacenamiento USB). Se conserva porque es inocuo y está probado en TEST, pero no se presenta como causa.

### 2.4 Acceso fuera de la LAN (provisional, ya implementado)

A petición del usuario se añadió una vía por VPN privada (Tailscale), sin abrir puertos ni cambiar el emparejamiento:

- Desktop escucha también en la interfaz Tailscale (solo `100.64.0.0/10` en una interfaz con ese nombre) y anuncia sus IP de VPN en el `WELCOME` (campo opcional `altHosts`).
- Android memoriza solo direcciones de ese rango y, si ninguna Wi‑Fi del teléfono comparte subred con el PC, conecta a esa IP. Si vuelve la Wi‑Fi del PC, vuelve a la LAN.

Estado: TEST (Kotlin contra servidor simulado; Desktop 27/27). **No probado con datos móviles reales.** Requiere Tailscale instalado y con sesión iniciada en ambos dispositivos (no automatizable). Cumple «sin puertos entrantes públicos»; **no** cumple «sin intervención del usuario» (instalación y cuenta VPN).

### 2.5 Resultados de compilación y pruebas

| Elemento | Resultado | Notas |
|---|---|---|
| Desktop `node --test link/test` | **27/27** (en Linux; 25/25 antes en Windows) | Tests nuevos: rango VPN y `altHosts` en WELCOME |
| Desktop `npm run build` | Correcto | |
| Android `assembleDebug` | Correcto | |
| Android `testDebugUnitTest` | 388 ejecutadas, **2 fallos** | Ambos **preexistentes**: `NmeaUdpAisSourceTest` (×2, «port out of range:-1»; el archivo se editó el 11/10 y el original está en `backup-before-boat-network-20261011`) |
| `RouteAutoTrackTest` | Intermitente | **Preexistente**: hace una llamada de red real en `VelarisSessionRepository` (`Dispatchers.IO`). Falló una vez, pasó en otras |
| `LinkClientTest` | 9/9 | Wi‑Fi perdida y recuperada, temporizador sin aviso de red, sin ruta Wi‑Fi, VPN aprendida, conexión por VPN sin perder ni duplicar, revocación y código incorrecto |
| `LinkProtocolTest` | 6/6 | Compara el modelo Kotlin con los fixtures |
| `LinkInteropTest` | 1/1 | Cliente Kotlin contra el servidor Node real |

---

## 3. Vinculación y persistencia

### 3.1 Qué se guarda y dónde

| Lado | Dato | Dónde | Protección |
|---|---|---|---|
| Desktop | `desktopId` (UUID) y nombre | `identity.json` | — |
| Desktop | Dispositivos autorizados y token | `devices.json` | Token cifrado con `safeStorage` (DPAPI en Windows) |
| Desktop | Servidor activo o no | `settings.json` → `enabled` | **Por defecto `false`**: el usuario debe activar Link una vez |
| Desktop | Cursores de sincronización | `sync/<desktopId>.json` | — |
| Android | `deviceId` (UUID) | SharedPreferences `velaris_link` | — |
| Android | `desktopId`, nombre, host, puerto, `alt_host` | ídem | — |
| Android | Token | ídem, campo `token_enc` | AES-GCM con clave del Android Keystore |

La identidad **no** es la IP: cada lado se identifica por su UUID y la IP solo es un destino reemplazable (`updateEndpoint`, `altHost`). **EXISTE, TEST.**

### 3.2 Persistencia de la vinculación

- **Reinicio de Desktop o de la app Android:** la vinculación se conserva por diseño (se guarda en disco antes de aceptarla). Cubierto por TEST («la vinculación sobrevive al reinicio», Desktop). **No verificado en dispositivos reales** reiniciando cada uno.
- **Corte de red:** no toca la vinculación (REAL: se reconectó sin volver a emparejar).
- **Desktop apagado:** Android conserva el token y reintenta (backoff, tope 15 s). TEST.

### 3.3 Cuándo se pide volver a vincular (comportamiento actual)

| Situación | Resultado |
|---|---|
| Usuario revoca el teléfono en Desktop | Desktop cierra la conexión; en el siguiente intento recibe `NOT_AUTHORIZED` y **Android borra su token** y pide vincular de nuevo. Correcto y pedido. TEST |
| Usuario pulsa «Desvincular» en Android | Se borra el token local; Desktop debería revocarlo desde su panel. TEST |
| `devices.json` perdido o ilegible en Desktop (reinstalación, otro usuario de Windows, DPAPI no descifra) | Desktop responde `NOT_AUTHORIZED` fatal y **Android borra su token**. Es una pérdida de vinculación que **no es una revocación explícita**. **Riesgo (R4)** |
| Copia de seguridad restaurada en otro teléfono (la clave del Keystore no existe) | El token no se descifra: se ignora y hay que vincular de nuevo. Intencionado |
| Desktop cambia de IP | Se recupera por el beacon (si hay descubrimiento activo, ver §4) |

### 3.4 Qué no existe aún

- Distinguir «autorización revocada» de «Desktop no me reconoce por pérdida de datos».
- Renovación de credenciales o rotación del token por dispositivo.
- Vinculación con varios escritorios por teléfono (solo se guarda uno).
- Revocar desde el teléfono hacia Desktop de forma remota.

---

## 4. Descubrimiento y comprobación de disponibilidad

### 4.1 Mecanismos actuales

| Mecanismo | Detalle | Límite real |
|---|---|---|
| Beacon UDP | Desktop envía a la dirección de difusión de cada interfaz privada, cada 2 s, con `name`, `port`, `versions`, `pairing` y el `desktopId` en el sobre | No cruza routers ni subredes; lo bloquea el aislamiento de clientes del AP. **No es autenticación** |
| Escucha en Android | `LinkDiscovery` solo se activa si la pantalla Link está visible **o** hay escritorio vinculado en estado de espera de reintento | Con la sesión conectada no escucha |
| Reintento por IP guardada | Backoff 1→15 s sobre el último host conocido | Sin red común no llega nunca |
| Callback de red Wi‑Fi | Reintenta al aparecer una Wi‑Fi nueva o cambiar su IP | Solo Wi‑Fi; no observa datos móviles |
| Heartbeat | 5 s, obsoleto a los 15 s | Detecta cortes **con la sesión abierta** |

### 4.2 Lo que NO existe

- Presencia remota («Desktop está encendido y accesible en Internet»).
- mDNS/NSD ni descubrimiento por otro medio que el beacon UDP.
- Desktop no puede saber que el teléfono «está disponible» antes de que éste conecte: solo ve sesiones autenticadas.
- Estado explícito «vinculado pero no disponible» frente a «sesión conectada».
- El beacon anuncia el nombre del PC y su UUID a toda la LAN (ver R6).

**«Conectado» solo se muestra tras `WELCOME` autenticado** (TEST). Una autorización guardada no se presenta como conexión. Es la regla que hay que mantener.

### 4.3 Ciclo de vida real

**Desktop**

- `app.on('window-all-closed')` → `app.quit()` en Windows: **cerrar la ventana cierra la aplicación y el servidor Link** (`before-quit` → `shutdown()`). No hay bandeja del sistema ni «minimizar a segundo plano» (no encontrado en `electron-main.js`).
- El servidor arranca al iniciar la app solo si `settings.enabled` es `true`.
- Inicio con Windows y comportamiento al suspender/reanudar el PC: **NO VERIFICADO**.
- Con la ventana minimizada la app sigue viva y Link sigue activo (no hay lógica que lo pare). **NO VERIFICADO en la práctica.**

**Android**

- `LinkManager.start()` se invoca desde un `LaunchedEffect` en `VelarisNavHost`: **solo mientras la interfaz de la app esté creada**. No hay inicio a nivel de `Application` ni receptor de arranque para Link (el receptor `BOOT_COMPLETED` existente es de las alarmas de llegada).
- `TrackRecordingForegroundService` mantiene vivo el proceso durante la grabación, pero con `stopWithTask="true"`: si el usuario descarta la app, el servicio se detiene.
- Consecuencia: **si la app muere, Link no se reconecta hasta que el usuario abra la app**, y la grabación en curso se interrumpe, aunque el diario conserva los puntos ya escritos y se recupera al reabrir (TEST unitario; **no probado matando la app en el teléfono real**).
- Restricciones de batería del fabricante (ColorOS en el OPPO, Android 16): **NO VERIFICADO**. Riesgo conocido en la práctica.

---

## 5. Arquitectura objetivo

### 5.1 Principios

1. **Vinculación ≠ conexión.** La vinculación es persistente (identidad + autorización). La conexión es una sesión temporal con nuevo `sessionId` y nuevo reto cada vez.
2. **El protocolo de aplicación no depende del transporte.** Se reutilizan los mismos sobres (`HELLO…ACK`) y la misma sincronización por cualquier transporte.
3. **Local primero; remoto cuando no hay ruta local.** Un solo transporte activo por pareja de dispositivos.
4. **La nube no ve datos náuticos en claro.** Si hay relé, cifrado extremo a extremo con clave derivada del secreto del emparejamiento.
5. **Autonomía:** cada app funciona sola y conserva sus datos.
6. **Honestidad de estado:** vinculado / disponible / sesión conectada / sincronizado / última posición conocida son estados distintos.

### 5.2 Capas

```
 ┌────────────────────────────────────────────────────────────┐
 │ Sincronización   diario · cursores · ACK · dedupe (existe)  │
 ├────────────────────────────────────────────────────────────┤
 │ Sesión           HELLO/CHALLENGE/AUTH/WELCOME (existe)      │
 ├────────────────────────────────────────────────────────────┤
 │ Confianza        deviceId · desktopId · token (existe)      │
 ├────────────────────────────────────────────────────────────┤
 │ Selector de transporte (NO existe)                          │
 ├───────────────┬──────────────────┬─────────────────────────┤
 │ LAN WebSocket │ VPN WebSocket    │ Relé remoto (NO existe) │
 │ (existe)      │ (provisional)    │ Supabase Realtime       │
 └───────────────┴──────────────────┴─────────────────────────┘
```

### 5.3 Diagrama de comunicaciones

```
        MISMA RED (con o sin Internet)
  ┌────────────┐  ws:47811 / beacon udp:47812  ┌──────────────┐
  │ VELARISdroid│◄─────────────────────────────►│ VELARIS      │
  │  (Android)  │                               │  Desktop     │
  └─────┬───────┘                               └──────┬───────┘
        │ Wear Engine                                   │ Supabase (auth, bitácora, rutas)
        ▼                                               ▼
  ┌────────────┐                                  ┌────────────┐
  │ VELARISGT6  │                                  │ Supabase   │
  └────────────┘                                  └─────▲──────┘
                                                        │
        REDES DISTINTAS (objetivo, Fase 3)              │ salida TLS
  ┌────────────┐   TLS, saliente   ┌────────────┐◄──────┘
  │ Android     ├──────────────────►│ Relé       │   (Desktop también sale;
  │ datos móv.  │                   │ Realtime   │    sin puertos entrantes)
  └────────────┘                   └────────────┘

        PROVISIONAL (ya implementado)
  Android (datos móviles + Tailscale) ──ws──► Desktop (100.x.y.z:47811)
```

### 5.4 Política de selección de transporte (propuesta)

1. Si una Wi‑Fi del teléfono comparte subred con el PC → **LAN** (la IP viene del beacon o de la última conocida).
2. Si no y hay IP de VPN conocida → **VPN** (provisional).
3. Si no y hay presencia remota del otro dispositivo → **relé**.
4. Si nada: **espera** con backoff y jitter; la vinculación se conserva.
5. Al recuperar una ruta de mayor prioridad con la sesión abierta por otra inferior, migrar (ya hecho LAN←VPN; sin histéresis formal).
6. Un solo intento en vuelo; cancelar los obsoletos (hay contador de generación en `LinkClient`); sin tormentas: backoff con jitter y tope.

### 5.5 Relé remoto: opciones evaluadas

Supabase hoy: Auth y tablas con RLS por propietario (`barcos.user_id`, `capitan_id`; migración `016_rls.sql`), 22 migraciones, Realtime `postgres_changes` en `vessel_status`/`bitacora`. **No hay Edge Functions** (`supabase/` solo tiene `config.toml` y `migrations`). **Android no tiene cliente Supabase ni identidad.**

| Opción | Cubre «Desktop encendido en casa, Droid con datos» | Cubre «Desktop apagado» | Coste y riesgo |
|---|---|---|---|
| A. VPN (Tailscale) | Sí, si ambos tienen la VPN activa | No | Ya hecho; requiere instalar y mantener la VPN; sin intervención cero |
| B. Supabase Realtime (Presence + Broadcast) como transporte de sobres Link, con cifrado E2E | Sí | No (Broadcast no persiste) | Medio: identidad Android, autorización por barco, cifrado E2E nuevo, límites de cuota |
| C. Supabase tablas (almacenar y reenviar tracks/eventos) | Sí, diferido | **Sí** | Medio-alto: esquema nuevo, RLS por barco, privacidad de posiciones en la nube |
| D. Relé propio (VPS) | Sí | Opcional | Infraestructura y mantenimiento propios |

Recomendación (a decidir por el usuario): **B + C como dos etapas**: B para presencia y conexión remota en vivo; C solo para el diferido cuando Desktop está apagado, y únicamente si se acepta almacenar tracks en la nube. Mantener A como alternativa inmediata. No se recomienda exponer puertos del PC (descartado por requisito) ni D salvo que Supabase no alcance.

---

## 6. Flujo de primera vinculación (actual)

1. En Desktop: activar Link (`settings.enabled`) y «Vincular dispositivo» → código de 6 dígitos, válido 2 min, un solo uso, 5 intentos.
2. En Android (pantalla LINK): rellenar **IP del escritorio, puerto y código** (los campos admiten escribirlos a mano; la lista de escritorios descubiertos por el beacon permite rellenar la IP). Esta entrada manual de IP es la que el objetivo quiere eliminar de las conexiones posteriores; en la primera vinculación puede mantenerse como respaldo.
3. `HELLO → CHALLENGE → PAIR_REQUEST(código)` → Desktop muestra la solicitud y exige **aceptación explícita**.
4. `PAIR_RESULT(token 256 bits)`; ambos lados lo guardan cifrado.
5. `AUTH` con prueba → `WELCOME` → sincronización inicial.

Propuesta para fases posteriores (sin cambiar este flujo): durante este mismo paso, intercambiar los datos necesarios para la ruta remota (identificadores del canal de relé y material de clave E2E derivado del token), de modo que no haya segunda vinculación.

## 7. Flujo de reconexión automática (objetivo)

1. **Evento** (arranque de la app, cambio de red, pérdida de sesión, aviso de presencia) → el supervisor cancela intentos obsoletos.
2. **Selección** de transporte según §5.4.
3. **Conexión** y `HELLO`.
4. **Autenticación por sesión** con la prueba HMAC; el token permanente no viaja.
5. `WELCOME` ⇒ **solo entonces** el estado pasa a «Conectado».
6. `SYNC_REQUEST/SYNC_STATE` ⇒ reanudar desde el último punto confirmado.
7. Supervisión: heartbeat, `networkLost()`, `STALE` ⇒ vuelve al paso 1 con backoff + jitter.
8. Revocación explícita (`NOT_AUTHORIZED` por revocación real) ⇒ borrar y pedir vincular. Cualquier otro fallo ⇒ conservar la vinculación (ver R4).

---

## 8. Matriz de escenarios

| # | Escenario | Hoy | Objetivo |
|---|---|---|---|
| 1 | Misma Wi‑Fi, con Internet | EXISTE, TEST, REAL | — |
| 2 | Misma Wi‑Fi, sin Internet | EXISTE, TEST (callback sin INTERNET) | Verificar en barco |
| 3 | Wi‑Fi diferentes | **No conecta** por LAN (REAL, causa del fallo); VPN lo cubre si está activa | Relé (Fase 3) |
| 4 | Droid con datos, Desktop en casa | Solo VPN (TEST, no probado en real) | Relé (Fase 3) |
| 5 | Droid en el barco, Desktop lejos | Solo VPN | Relé; diferido (opción C) |
| 6 | Juntos en el barco, red local sin Internet | EXISTE, TEST | Verificar |
| 7 | Pérdida y recuperación de Wi‑Fi | EXISTE, TEST; REAL (misma red, «pocos segundos», sin medir) | Medir tiempo; Fase 1 |
| 8 | Cambio Wi‑Fi ↔ datos | Parcial: usa VPN si hay `altHost` | Selector (Fase 2) |
| 9 | Pérdida y vuelta de cobertura móvil | Heartbeat/STALE (TEST); sin remoto no aplica | Fase 3 |
| 10 | Reinicio de cualquiera | Persistencia por diseño; TEST Desktop; **sin probar en real** | Fase 1 |
| 11 | Apagado temporal de uno | Reintento con backoff (TEST) | Presencia (Fase 3) |
| 12 | Desktop cerrado y reabierto | Cerrar ventana = salir (R2); al reabrir hay que tener Link activo; Android reintenta | Decisión §10 |
| 13 | Fallo del servicio remoto | N/A | Fase 3 |
| 14 | Desconexiones repetidas | TEST (corte a mitad de envío, reconexión, sin duplicados) | Prueba de estrés en real |
| 15 | Tracks tras horas o días | Diario durable (TEST); sincroniza al volver | Probar volumen en real |
| 16 | Uno disponible, el otro inaccesible | Estado «Reintentando» | Estados §8 del encargo |
| 17 | Cambio de ubicación sin reconfigurar | LAN: beacon (sin cruzar redes) | Relé |

---

## 9. Qué se ha probado dónde (resumen honesto)

| Capacidad | Automático | Dispositivos reales |
|---|---|---|
| Emparejamiento y primera conexión | Sí | **Sí** (OPPO) |
| Sincronización de tracks, ACK, dedupe, corte a mitad | Sí (Kotlin + Node real, simulador) | **No** con tracks largos |
| Reconexión tras apagar/encender Wi‑Fi (misma red) | Sí | **Sí, una vez, sin medir** |
| Diagnóstico de red distinta | Sí | Sí (el log real lo reveló) |
| Persistencia tras reinicio | Sí (Desktop) | **No** |
| App Android matada y reabierta | Sí (diario) | **No** |
| VPN con datos móviles | Sí (simulado) | **No** |
| Relé remoto, presencia, estados «disponible» | **No implementado** | — |

---

## 10. Decisiones técnicas pendientes (requieren al usuario)

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | Vía remota definitiva | VPN / Supabase B / B+C / relé propio | B (+C si se acepta datos en la nube); VPN como puente |
| D2 | Identidad de Android ante Supabase | Cuenta del usuario (misma que Desktop) / identidad anónima ligada al emparejamiento | Cuenta del usuario con autorización por barco (como en `016_rls.sql`) |
| D3 | ¿Se almacenan tracks/posiciones en la nube? | Sí / No (solo relé en vivo) | Decidir con criterio de privacidad y retención |
| D4 | Comportamiento al cerrar Desktop | Seguir igual / minimizar a bandeja con Link activo | Bandeja: sin ella, «Desktop encendido» es frágil |
| D5 | ¿Link activo por defecto? | Hoy `enabled:false` | Activar tras la primera vinculación |
| D6 | Servicio en primer plano de Link en Android | Sin servicio / servicio ligero mientras haya vinculación | Justificar consumo; hoy Link depende de la UI |
| D7 | Qué hacer ante `NOT_AUTHORIZED` por pérdida de datos | Hoy se borra el token | Distinguir revocación real (R4) |
| D8 | TLS en la conexión local | `ws://` hoy; `wss://` con certificado fijado en el emparejamiento | Fase 2 |
| D9 | Una pareja o varios escritorios por teléfono | Hoy uno | Mantener uno |

---

## 11. Riesgos de seguridad

| # | Riesgo | Estado | Mitigación propuesta |
|---|---|---|---|
| R1 | Claves de servicio de Supabase y de otros proveedores expuestas en `.env`/instalador (hallazgo previo) | Retirada del instalador hecha; **la rotación NO está hecha** (requiere al usuario) | Rotar y documentar; no incluir secretos en cliente |
| R2 | Cerrar la ventana de Desktop cierra el servidor Link | Comportamiento actual | D4 |
| R3 | `ws://` sin TLS en la LAN: el tráfico puede leerse en la red local (el token no viaja, pero sí posiciones y tracks) | Abierto | D8; por VPN va cifrado |
| R4 | Android borra su token ante cualquier `NOT_AUTHORIZED` fatal, también si Desktop perdió sus datos | Abierto | D7 |
| R5 | URL y clave *anon* de Supabase **fijas en el código** (`src/lib/superbase.ts`, `src/supabaseClient.ts`) en vez de variables de entorno. La clave anon es pública por diseño, pero depende totalmente de que RLS sea correcta | Abierto | Auditar RLS (`016_rls.sql`) y moverlas a configuración |
| R6 | El beacon difunde en la LAN el nombre del PC, su UUID y si el emparejamiento está abierto | Abierto | Limitar el contenido; mostrar solo con Link activo y red de confianza |
| R7 | Interfaz VPN aceptada por nombre (`/tailscale/i`) en rango `100.64/10` | Mitigado: ese rango en otra interfaz se rechaza (TEST) | Revisar si se añaden otras VPN |
| R8 | Relé en la nube: confianza en el proveedor, metadatos, cuotas, suplantación | Futuro | Cifrado E2E, RLS por barco, limitación de frecuencia, revocación |
| R9 | Suplantación del escritorio en la LAN: el teléfono prueba el token al escritorio, pero el `WELCOME` no lleva ninguna prueba del escritorio, así que el teléfono no verifica con quién habla | Abierto | Fase 2: respuesta HMAC del escritorio sobre el reto del teléfono, o `wss://` con certificado fijado |
| R10 | Restricciones de segundo plano/batería del fabricante | **NO VERIFICADO** | Prueba en OPPO; documentar excepciones |

---

## 12. Plan de implementación por fases

Propongo mantener el orden del encargo con un ajuste: **la Fase 1 debe incluir antes la prueba de apagado/cierre**, porque hoy cerrar la ventana de Desktop o matar la app Android corta la conexión y la grabación (R2, §4.3).

| Fase | Contenido | Pruebas necesarias |
|---|---|---|
| **0** | Esta auditoría | Revisión del usuario |
| **1. Estabilidad local y persistencia** | Medir y fijar el tiempo de reconexión; jitter en el backoff; estados «vinculado / disponible / conectado»; D7 (no borrar token por pérdida de datos); decisión D4/D6; documentar límites del SO | Unitarias: backoff con jitter, `NOT_AUTHORIZED` por revocación frente a desconocido. Reales (OPPO): reinicio de cada dispositivo, matar la app, 20 ciclos de Wi‑Fi apagada/encendida, medir segundos, track de varias horas |
| **2. Transporte abstracto** | Interfaz `Transport` (LAN, VPN); selector con histéresis; autenticación del escritorio en sesión (R9); `wss://` opcional (D8) | Contrato con los mismos fixtures sobre cada transporte; interoperabilidad Kotlin↔Node; pruebas de migración LAN↔VPN sin duplicados |
| **3. Conectividad remota** | Presencia y relé según D1/D2; identidad Android; cifrado E2E; sin puertos entrantes | Dos redes distintas, datos móviles, CGNAT, caída del servicio, límites de cuota, revocación |
| **4. Sincronización remota resistente** | Cola persistente, cursores por transporte, última posición conocida, corte de varios días | Cortes prolongados, reinicios en mitad del envío, volumen grande |
| **5. Fuentes de datos y observabilidad** | Metadatos de fuente/validez/edad por dato (COG ≠ HDG); estados de UI | Pruebas de selección por tipo de dato; visuales |
| **6. Bluetooth y GT6** | Estudio de viabilidad; el reloj sigue por Wear Engine | Informe previo; solo implementar si aporta valor |

Cada fase se entrega por separado, con pruebas Android y Desktop, y separando los fallos preexistentes (`NmeaUdpAisSourceTest`, `RouteAutoTrackTest`) de los nuevos.

---

## 13. Límites reales de las plataformas

- **Desktop completamente cerrado:** no hay proceso que escuche. Ni la LAN ni un relé pueden entregar nada a Desktop hasta que arranque; los datos esperan en el diario de Android. Para presencia continua haría falta bandeja del sistema o inicio con Windows (D4).
- **Android con la app descartada:** sin servicio en primer plano no hay conexión ni grabación. La grabación activa usa un servicio, pero se detiene al descartar la tarea (`stopWithTask`).
- **Datos móviles:** CGNAT impide conexiones entrantes; solo valen conexiones salientes (relé o VPN).
- **Beacon UDP:** no cruza subredes ni AP con aislamiento de clientes.
- **GT6:** habla con Android por Wear Engine; no tiene identidad ni transporte propio hacia Desktop o la nube, y esta propuesta no lo cambia.
- **«Encendido» ≠ «disponible»:** sin ruta, ningún mecanismo puede conectar; el sistema debe mostrar «esperando», no «conectado».

## 14. Documentación creada o modificada

| Archivo | Acción |
|---|---|
| `VELARIS\docs\CONECTIVIDAD_UNIVERSAL_FASE0.md` | **Creado** (este documento) |
| `VELARIS-Link\PROTOCOL.md` | Modificado antes de esta fase: campo opcional `altHosts` en `WELCOME` |
| `VELARIS-Link\fixtures\messages.json` | Modificado antes de esta fase: `altHosts` en el fixture de `WELCOME` |
| `VELARIS\ARQUITECTURA_CONECTIVIDAD_SINCRONIZACION.md` | Sin cambios (referencia) |

En esta fase **no se ha modificado código funcional**. Los cambios de código anteriores (reconexión, diagnóstico y VPN) están descritos en §2.3 y §2.4, con copias de seguridad en `backup-before-link-reconnect-20261013` y `backup-before-vpn-20261013`.
