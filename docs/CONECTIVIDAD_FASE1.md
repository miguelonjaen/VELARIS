# VELARIS Link — Conectividad, Fase 1

Estado: implementada y probada con pruebas automáticas. **Ninguna prueba física en el OPPO se da por validada** hasta que el usuario confirme los resultados (ver §10).
Alcance: solo Fase 1 (D4, D5, D6 parcial, D7). D1, D2, D3 → Fase 3. No se ha cambiado el protocolo ni el procedimiento de emparejamiento.

## 1. Resumen de cambios

| Área | Cambio |
|---|---|
| Reconexión (Android) | `RetryPolicy`: backoff exponencial con jitter y tope. Un único punto de apertura de socket (`openSocket`) que cancela el temporizador y cierra el socket anterior: nunca hay dos conexiones a la vez. Debounce de 1 s ante ráfagas de avisos de red. Reintento manual que reinicia la política. |
| Estados | `LinkStatus` separa **vinculado / disponible / sesión conectada / sincronizado**. «Conectado» solo tras verificar `WELCOME`. |
| Verificación de `WELCOME` | Se rechaza si llega sin haber enviado `AUTH`, duplicado, con `desktopId` distinto del vinculado o incoherente con el `CHALLENGE`, o con versión no soportada. |
| Medición | `RecoveryTracker`: pérdida → red recuperada → intentos → WS abierto → WELCOME → sincronización completa, en segundos, separando tiempo de sesión y de sincronización. Desktop registra además `desconexión→WELCOME` por dispositivo. |
| Persistencia (D7) | Un `NOT_AUTHORIZED` ya no borra el token. Se marca `desktopNotRecognized`, se muestra «Desktop no reconoce este teléfono» y se sigue reintentando con backoff. Solo «Desvincular» (acción del usuario) borra. |
| Android (D6) | `VelarisApp : Application` arranca `LinkManager.start()` (idempotente, protegido con `runCatching`). Servicio en primer plano: solo análisis (§8). |
| Desktop (D4) | Bandeja del sistema; cerrar la ventana la oculta y Link sigue activo; «Salir» explícito; instancia única. |
| Desktop (D5) | Tras el primer emparejamiento correcto `settings.enabled = true` (persistente). |

## 2. Arquitectura de reconexión (Android)

- `LinkClient.openSocket()` es el único camino para abrir conexiones. Lo invocan: arranque/reintento manual (`connectPaired`), temporizador de backoff, aviso de red disponible, y regreso a LAN desde VPN.
- Cada llamada: cancela `retryJob`, cierra el socket anterior (incrementa `generation`; los callbacks tardíos de sockets viejos se ignoran), elige de nuevo la red (`routeTo`) y abre.
- Avisos de red: `NETWORK_AVAILABLE` con un intento abierto hace menos de 1 s → `RETRY_NOW_IGNORADO`. Con el temporizador esperando → reintento inmediato y reinicio de la política.
- `NETWORK_LOST` se ignora si la sesión va por VPN (no depende de esa Wi-Fi).
- El `TrackJournal` nunca se borra al recibir ACK; la sincronización sigue siendo la existente (cursores, idempotencia).

## 3. Política de backoff

| Parámetro | Valor |
|---|---|
| Base | 1 s |
| Factor | ×2 |
| Tope | 30 s |
| Jitter | ±20 % (la espera real nunca supera el tope) |
| Secuencia nominal | 1, 2, 4, 8, 16, 30, 30… s |
| Reinicio a intento 0 | `WELCOME` verificado · reintento manual · red nueva disponible |

Un tope de 30 s acota el peor caso de reconexión tras volver la red a ~30 s +/- jitter si no hay aviso de red; con aviso de red el reintento es inmediato. Con el escritorio apagado el cliente intenta cada ~30 s: coste bajo, sin bucle agresivo.

## 4. Significado exacto de los estados

| Estado | Criterio | Se muestra |
|---|---|---|
| **Vinculado** | Credenciales guardadas (token + desktopId). No implica conexión ni disponibilidad. | «Vinculado · …» |
| **Disponible** | Baliza UDP del escritorio vinculado vista hace ≤ 10 s, **o** ha respondido en el intento en curso (mensaje recibido ≤ 10 s), **o** hay sesión. | «escritorio detectado» |
| **Sesión conectada** | `WELCOME` recibido **y verificado**. Un socket abierto, un `CHALLENGE` o un `AUTH` enviado no bastan. | «Conectado» |
| **Sincronizado** | Sesión conectada **y** `SYNC_STATE` recibido **y** 0 pendientes de confirmar. | «Conectado · sincronizado» |
| Sesión con pendientes | Sesión conectada pero pendientes > 0 o sin `SYNC_STATE` | «Conectado · sincronizando» |
| No reconocido | Desktop respondió `NOT_AUTHORIZED` fatal al `AUTH` | «Desktop no reconoce este teléfono» |

Nunca se muestra «Sincronizado» con datos pendientes ni «Conectado» antes del `WELCOME`.

## 5. Medición de la reconexión

Eventos de log (logcat y pantalla LINK → Diagnóstico) con marca de tiempo:

`NETWORK_LOST` · `NETWORK_AVAILABLE` · `RETRY_SCHEDULED intento N en X ms (nominal Y ms, jitter ±20 %) · motivo` · `RETRY_FIRE` · `RETRY_NOW` / `RETRY_NOW_IGNORADO` · `RETRY_MANUAL` · `CONNECT_START #gen intento N` · `WS_OPEN` · `WELCOME` / `WELCOME_RECHAZADO` · `RECUPERACION_SESION …` · `RECUPERACION_SINCRONIZADA …`

Resumen por recuperación (ejemplo de formato):
`PERDIDA inicio→WELCOME 4.2 s · WELCOME→sincronizado 0.8 s · red recuperada a +1.1 s · WS abierto a +2.0 s · intentos 1 · motivo: Red Wi-Fi perdida`

- **Tiempo de sesión** = pérdida → `WELCOME` verificado.
- **Tiempo de sincronización** = `WELCOME` → 0 pendientes con `SYNC_STATE`. Depende del volumen pendiente; se mide aparte.
- Una segunda pérdida durante la misma recuperación no reinicia el reloj. Se guardan las últimas 10.
- Desktop: `RECUPERACION_SESION <dispositivo>: desconexión→WELCOME X.X s` y evento `recovery`. Si la conexión previa fue sustituida (`REPLACED`) el valor es ~0 s y no representa tiempo real de recuperación.

## 6. Persistencia de la vinculación y errores

- Token: DPAPI en Desktop, Keystore (AES-GCM) en Android. No se borra, regenera ni sobrescribe como recuperación.
- Android: `NOT_AUTHORIZED` genérico → conserva la vinculación, `desktopNotRecognized = true`, backoff. El flag se limpia con un `WELCOME` verificado.
- **Limitación (sin cambiar el protocolo):** Desktop envía el mismo `NOT_AUTHORIZED` si el teléfono fue revocado, si Desktop perdió sus datos o si el token es erróneo. Android no puede distinguirlos; por eso nunca borra. Propuesta para la Fase 2 (requiere autorización): código de error aditivo `REVOKED` para la revocación explícita, de modo que solo ese borre el token.
- Error de red (`WS_FAILURE`, timeout, sin ruta) ≠ error de autenticación: solo el segundo activa «Desktop no reconoce este teléfono».
- Pruebas: reinicio de Desktop con mismo token (reconexión), `enabled` persistente, token conservado ante `NOT_AUTHORIZED`, «Desvincular» borra.

## 7. Bandeja de Desktop (D4)

- Cerrar la ventana (X): se **oculta**, Link sigue activo; aviso de globo la primera vez.
- Icono en bandeja: clic / doble clic → «Abrir VELARIS»; menú con estado de Link y dispositivos conectados, y **«Salir»**.
- «Salir» (o `app.quit()` del actualizador): marca la salida en `before-quit`, cierra Link (`shutdown`) y termina.
- Instancia única (`requestSingleInstanceLock`): un segundo VELARIS enfoca la ventana existente (dos instancias compartirían el puerto 47811).
- Módulo puro `link/closeBehavior.js` (probado). El cableado Electron (`Tray`, `Menu`, eventos) **no tiene prueba automática**: se valida a mano (§10, pasos 3 y 4).
- Limitaciones: apagar el PC, cerrar sesión de Windows, «Salir», matar el proceso o suspensión del equipo detienen Link. Si el usuario nunca emparejó, Link sigue desactivado (D5 solo actúa tras emparejar).

## 8. Android: arranque, ciclo de vida y servicio en primer plano

**Implementado:** Link arranca en `Application.onCreate`; `start()` es idempotente (`started`), por lo que las pantallas que llaman a `getInstance(...)` no duplican instancias.

**Servicio en primer plano — NO implementado; análisis para decidir:**

| Aspecto | Realidad |
|---|---|
| Qué resuelve | Mantener vivo el proceso (y el WebSocket) con la app en segundo plano / pantalla apagada. |
| Android 14+ | Obliga a declarar `foregroundServiceType`. `location` solo es válido si realmente se usa ubicación; el actual `TrackRecordingForegroundService` (type=location) ya mantiene el proceso durante una grabación. `dataSync` tiene límite de tiempo en Android 15 (≈6 h/24 h). `connectedDevice` exige permisos/condiciones de dispositivos conectados que no encajan con un PC por Wi-Fi. |
| Notificación | Obligatoria y permanente mientras exista la vinculación (percepción de «app siempre activa»). |
| Batería | Un WebSocket ocioso con latido de 5 s impide que la radio Wi-Fi entre en reposo profundo: coste continuo, no despreciable (a medir en el OPPO). |
| OEM (OPPO/ColorOS) | Pueden matar procesos aunque haya servicio, salvo exención de optimización de batería / «permitir actividad en segundo plano». |
| Alternativas | (a) Solo `Application` (actual): Link vive mientras el sistema mantenga el proceso. (b) Mientras haya grabación, el servicio de grabación ya mantiene el proceso, que es cuando más importa sincronizar. (c) Pedir exención de batería al usuario. (d) Latido adaptativo (más lento en segundo plano). (e) Arranque oportunista por red (`NetworkCallback` no despierta un proceso muerto). |
| Recomendación | No añadir servicio permanente ahora. Medir en el OPPO primero (§10): si el proceso sobrevive lo suficiente con la exención de batería y durante grabaciones, no hace falta. Si no, proponer un servicio con tipo y notificación justificados, con tu autorización. |

## 9. Límites reales (no se promete reconexión en estos casos)

- App detenida por el usuario («Forzar detención») → no hay proceso: no reconecta hasta abrirla.
- Descartar de recientes (swipe): depende del fabricante; el proceso puede sobrevivir o no. A documentar con la prueba 5.
- Dispositivo apagado, modo avión, sin ruta (Wi-Fi distinta sin VPN, sin datos): no hay comunicación posible.
- Doze / ahorro de batería: pueden retrasar o cortar la conexión en segundo plano.
- Desktop cerrado («Salir»), PC apagado/suspendido o servidor desactivado: sin servidor no hay sesión.
- Wi-Fi distinta: solo VPN existente (puente Tailscale). Remoto general → Fase 3.

## 10. Comandos ejecutados y resultados

### Android (`C:\PROYECTO GAULOS\VELARISdroid`, vía `_claude_p1_check.bat`)
- `gradlew.bat assembleDebug` → **BUILD SUCCESSFUL**, EXIT=0.
- `gradlew.bat testDebugUnitTest --continue` → **421 tests, 2 fallos**.

| Grupo | Resultado |
|---|---|
| 1. Nuevas / relevantes que pasan | `LinkClientTest` 14/14 · `RetryPolicyTest` 6/6 · `RecoveryTrackerTest` 7/7 · `LinkStatusTest` 12/12 · `LinkApplicationStartTest` 3/3. El resto de la suite (415) pasa. |
| 2. Fallos preexistentes conocidos | `NmeaUdpAisSourceTest` ×2 (`a short datagram does not truncate…`, `AIVDM over UDP is decoded…`). Son los 2 fallos preexistentes ya conocidos (el enunciado de la Fase 1 los lista); no se ha rehecho una ejecución limpia del commit anterior en esta sesión, pero el test falla en aserciones de UDP/AIS (líneas 83 y 55) sin relación con Link, que no se toca en `core/ais`. `RouteAutoTrackTest` (flaky conocido) **pasó** en esta ejecución. |
| 3. Fallos nuevos o sin explicar | **Ninguno.** |

Nota: la prueba de arranque desde `Application` es **estructural** (manifiesto + fuente), porque no hay Robolectric ni instrumentación; no ejecuta el ciclo de vida real.

### Desktop (`C:\PROYECTO GAULOS\VELARIS`, vía `_claude_p1_desktop.bat`)
- `npm run build` → EXIT=0.
- `node --test` sobre `protocol`, `linkStore`, `linkServer`, `closeBehavior` → **35/35** (antes 27). Nuevas: D5 + persistencia tras reinicio, reconexión con el mismo token, medición `desconexión→WELCOME`, 4 de ventana/bandeja (cerrar no sale; «Salir» sí; aviso solo una vez; menú).
- Una prueba mía falló una vez en Windows por una carrera del propio test (relojeaba antes del evento `close` del servidor); corregida esperando el cierre y reejecutada: 35/35.
- Sin cobertura automática: `Tray`/`Menu`/`requestSingleInstanceLock` reales de Electron.

## 11. Archivos modificados

**Android** (`VELARISdroid/app/src/...`)
- Nuevos: `core/link/RetryPolicy.kt`, `RecoveryTracker.kt`, `LinkStatus.kt`, `com/velaris/droid/VelarisApp.kt`
- Modificados: `core/link/LinkClient.kt`, `LinkManager.kt`, `feature/link/LinkScreen.kt`, `AndroidManifest.xml` (`android:name=".VelarisApp"`)
- Pruebas: `LinkClientTest.kt` (actualizada), nuevas `RetryPolicyTest`, `RecoveryTrackerTest`, `LinkStatusTest`, `LinkApplicationStartTest`

**Desktop** (`VELARIS/`)
- Nuevos: `link/closeBehavior.js`, `link/test/closeBehavior.test.js`
- Modificados: `electron-main.js`, `link/linkServer.js`, `link/test/linkServer.test.js`

**Copias de seguridad** de los originales: `C:\PROYECTO GAULOS\_tmp_link\backup-before-phase1-20261013\`. Auxiliares de ejecución (no borrados): `VELARISdroid\_claude_p1_check.bat`, `_claude_p1_desktop.bat`, logs `_p1_*.log`, `VELARIS\_p1_desktop_*.log`, `_tmp_link\p1\`.

## 12. Validación física en el OPPO (pendiente)

Preparación: instalar la APK debug de este build y la versión de Desktop con estos cambios; ambos en la misma Wi-Fi; abrir LINK → Diagnóstico para ver los eventos. Si hay Tailscale, desactivarlo en el teléfono para estas pruebas.

| # | Prueba | Pasos exactos | Resultado esperado |
|---|---|---|---|
| 1 | Reiniciar Desktop | Salir con «Salir» en la bandeja → abrir VELARIS | Teléfono: «Vinculado · esperando…» y, al volver Desktop, «Conectado» sin volver a emparejar |
| 2 | Reiniciar Android | Reiniciar el teléfono → abrir VELARIS Droid | Sigue «Vinculado»; reconecta sola; sin pedir código |
| 3 | Cerrar ventana de Desktop | Pulsar la X | Ventana oculta, icono en bandeja, teléfono sigue «Conectado» |
| 4 | Salir de Desktop | Menú de la bandeja → «Salir» | Proceso termina; teléfono pasa a «Vinculado · esperando al escritorio» y **no** a «Desvincular» |
| 5a | Android: cierre normal | Home → no abrir la app 2 min con Desktop abierto | Anotar si sigue conectada |
| 5b | Android: descartar de recientes | Deslizar la app fuera de recientes, esperar 2 min | Anotar si Desktop sigue viendo el teléfono |
| 5c | Android: forzar detención | Ajustes → Apps → VELARIS → Forzar detención | No reconecta hasta abrir la app (esperado) |
| 6 | 20 ciclos Wi-Fi | Ver tabla; en cada ciclo: apagar Wi-Fi, anotar hora; encender, anotar hora de Wi-Fi; leer del diagnóstico `WELCOME` y `RECUPERACION_SINCRONIZADA` | Registrar segundos |
| 7 | Anotación | Anotar errores e intervenciones manuales | — |

**Tabla de registro (prueba 6)**

| Ciclo | Pérdida (hh:mm:ss) | Wi-Fi recuperada | WELCOME | Sync completa | Sesión (s) | Sync (s) | Intentos | Error / intervención manual |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |
| 9 | | | | | | | | |
| 10 | | | | | | | | |
| 11 | | | | | | | | |
| 12 | | | | | | | | |
| 13 | | | | | | | | |
| 14 | | | | | | | | |
| 15 | | | | | | | | |
| 16 | | | | | | | | |
| 17 | | | | | | | | |
| 18 | | | | | | | | |
| 19 | | | | | | | | |
| 20 | | | | | | | | |

Para que el ciclo tenga datos pendientes que sincronizar, grabar un track corto antes de apagar la Wi-Fi en algunos ciclos (anotar cuáles).

**Estado de la validación física: PENDIENTE — ninguna prueba del §12 se ha ejecutado ni observado en el OPPO.**

## 13. Problemas pendientes

- Revocación explícita indistinguible de pérdida de datos de Desktop (protocolo): propuesta `REVOKED` para Fase 2.
- El `WELCOME` aún no demuestra criptográficamente la identidad del escritorio (R9 de la Fase 0); se verifica coherencia de `desktopId`, no firma.
- Servicio en primer plano: pendiente de decisión tras medir (§8).
- Medición real del tiempo de reconexión: nunca medida en dispositivo; solo la observación cualitativa «pocos segundos».
- Cableado real de bandeja/instancia única sin prueba automática.
- Dos terminales colgadas de sesiones anteriores siguen abiertas (el usuario debe cerrarlas) y las claves expuestas en su día deben rotarse.
