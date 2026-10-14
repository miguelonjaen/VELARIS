# Arquitectura objetivo de conectividad y sincronización VELARIS

**Estado:** propuesta de arquitectura para revisión; no implica implementación ni decisiones aprobadas
**Fecha:** 13 de octubre de 2026
**Ámbito:** VELARIS Desktop, VELARISdroid y VELARIS GT6
**Destino previsto:** raíz del repositorio VELARIS como `ARQUITECTURA_CONECTIVIDAD_SINCRONIZACION.md`

> Se inspeccionaron en solo lectura los árboles actuales bajo `C:\PROYECTO GAULOS`, en especial `VELARIS\link`, `VELARIS-Link\PROTOCOL.md` y `VELARISdroid\core\link`. La auditoría estática del 11 de octubre de 2026 se conserva solo como contexto histórico para áreas aún no revalidadas (Auth, APIs y GT6). No se modificó código ni los archivos de referencia sincronizados del proyecto ChatGPT.

## 1. Propósito y criterios

Definir cómo cooperan los tres productos cuando están a bordo, separados o desconectados. La solución debe permitir navegación local autónoma, dejar explícita la procedencia y edad de cada dato y sincronizar por LAN o nube solo cuando esos transportes estén disponibles. Perder Wi‑Fi o Internet nunca debe convertir un dato antiguo en una lectura actual ni impedir que cada dispositivo use sus fuentes locales.

Principios:

1. **La navegación local no depende de Internet, de Supabase ni de que Desktop esté encendido.** Cada dispositivo conserva las capacidades de sus sensores y datos locales.
2. **Un transporte no es una fuente de navegación.** Wi‑Fi o Bluetooth pueden transportar NMEA o datos VELARIS; su mera conexión no significa que exista un feed náutico.
3. **Estado explícito por campo.** Valor, validez, fuente, tiempos de observación/recepción, calidad y caducidad viajan juntos.
4. **No hay “último valor gana” entre sensores incompatibles.** La selección y el fallback son políticas visibles, configurables y comprobables.
5. **LAN para datos vivos; nube para cuenta y sincronización diferida.** El reloj se enlaza al Android mediante Wear Engine, no necesita identidad cloud independiente.
6. **Link v1 no debe ampliarse implícitamente a un canal general de comandos; cada nueva capacidad requiere contrato y autorización explícitos.** No se transmite control de piloto automático ni comandos de equipos de gobierno.

## 2. Estado actual confirmado y límites de la revisión

La revisión de solo lectura de `C:\PROYECTO GAULOS` confirma estos componentes en el árbol actual. No se modificó código ni se ejecutaron builds o pruebas.

| Área | Estado confirmado en el árbol | Límite / pendiente |
|---|---|---|
| Desktop | Electron; existe `link/` con `linkServer.js`, `linkStore.js`, `linkMain.js` y `protocol.js`. Link está desactivado por defecto, enlaza por TCP WebSocket 47811 y anuncia por UDP 47812; enlaza dispositivos con pairing explícito y HMAC. | El feed Link actual es esencialmente Android→Desktop: posición viva, tracks y eventos. No es un stream general de instrumentos Desktop→Android. El servidor de cartas 8089 es otra función y no debe confundirse con Link. |
| VELARISdroid | Existe `core/link/` con `LinkManager`, `LinkClient`, `LinkDiscovery`, `LinkSyncEngine`, credenciales y diario local de tracks. Usa red Wi‑Fi local incluso sin Internet, selección de ruta al PC y reconexión automática. | Verificar comportamiento real en teléfono/AP, suspensión del proceso, cambio de interfaz y pérdida prolongada. Los mecanismos en código no demuestran que la recuperación esté aceptada en campo. |
| VELARIS-Link | `VELARIS-Link/PROTOCOL.md` documenta Link v1, puertos, mensajes, pairing, heartbeat, sync reanudable y fixtures comunes. | El protocolo confirma la dirección de los datos y sus límites; no convierte Link en transporte NMEA ni de sincronización cloud. |
| GT6 | La auditoría anterior encontró Android↔GT6 vía Huawei Wear Engine. | En esta revisión no se inspeccionó el código GT6 actual; confirmar payload, frescura y fallback en ese árbol antes de declarar estado vigente. |
| Identidad y cloud | La auditoría previa observó Supabase Auth en Desktop y ausencia de Auth Android bajo el árbol que examinó; `PROTOCOL.md` deja cuentas y cloud como extensiones. | Revisar la situación actual. No afirmar que Android ya comparte identidad Supabase ni que Link sincronice con cloud. |
| Seguridad de Link | Código/protocolo: listeners en IPv4 privada/loopback, Link opt-in, autenticación HMAC con secreto por dispositivo cifrado en DPAPI/Android Keystore, pairing de un solo uso y aprobación en PC. | Transporte actual es `ws://` sin TLS; el propio protocolo identifica riesgo de captura/ataque activo en LAN. TLS con huella anclada está previsto, no implementado según el documento. |
| Seguridad de otras superficies | Auditoría anterior señaló aspectos del servidor local/API y almacenamiento de credenciales en Desktop que requieren revisión. | Confirmar si se corrigieron. No exponer el servidor 8089 o endpoints administrativos a la LAN basándose en los controles de Link: son superficies distintas. |

**Conclusión:** existe interconexión local VELARISdroid↔Desktop para datos definidos por Link v1 y sincronización de tracks/eventos. No existe evidencia aquí de que Link retransmita NMEA de Desktop a Android, ni de que el mismo enlace funcione a través de Internet o entre redes separadas.

## 3. Modelo de conectividad

### 3.1 Transportes y funciones

| Enlace | Uso actual confirmado | Objetivo / límite |
|---|---|---|
| Wi‑Fi/LAN del barco | VELARIS Link usa Desktop TCP 47811 (WebSocket) y anuncio UDP 47812; funciona sin Internet/Supabase. Android intenta usar la Wi‑Fi cuya subred contiene la IP del PC. | Transporte primario PC↔Android cuando comparten LAN. La red no implica que el PC tenga NMEA ni que el feed viaje en ambos sentidos. Aislamiento de clientes o firewall puede bloquearlo. |
| Gateway NMEA/Signal K | Android tiene gestor de fuentes de red; el documento Link prevé como extensión el servidor NMEA0183 TCP 10110 Desktop para que Android lo consuma. | Determinar por barco si el gateway comparte NMEA y quién se conecta a él. La extensión 10110 no debe tratarse como implementada sin comprobar código/configuración actuales. |
| Bluetooth PC↔Android | No está documentado como transporte actual de VELARIS Link. | Alternativa posible, pendiente de decidir y especificar (BLE/Classic, perfil, APIs, pairing, coexistencia con GT6). No asumir que Bluetooth permite compartir NMEA por sí mismo. |
| Huawei Wear Engine P2P | Android↔GT6 según auditoría previa. | Mantenerlo como enlace del reloj si se confirma en el árbol/build actual. No es un puente PC↔GT6. |
| Internet/Supabase | Desktop tiene integración Supabase según auditoría previa; protocolo Link indica cuentas/cloud como extensiones. | Cuenta y sincronización diferida de datos duraderos si se decide; no es transporte de navegación en tiempo real ni requisito para Link local. |
| GNSS/NMEA local | Android envía `POSITION` hacia Desktop; Link conserva tracks/eventos originados en el móvil. | GPS/NMEA disponible localmente en un equipo no se comparte automáticamente. Añadir feed de instrumentos Desktop→Android sería otra capacidad/contrato. |

### 3.2 Escenarios operativos

| Escenario | Conectividad | Comportamiento actual/objetivo |
|---|---|---|
| **1. Ambos a bordo; Wi‑Fi con gateway NMEA** | Link PC↔Android en LAN; cada dispositivo puede consumir el gateway según sus adaptadores. | Link v1 sigue enviando desde Android hacia Desktop (posición, tracks/eventos); no retransmite instrumentos Desktop→Android. Elegir una única ruta NMEA efectiva por campo o identificar duplicados. |
| **2. Ambos a bordo; Wi‑Fi local sin NMEA y Desktop sí tiene datos NMEA** | Link puede conectar si firewall/AP permiten TCP 47811 y UDP discovery o se introduce IP manual. | Link actual no comparte automáticamente los datos NMEA de Desktop con Android. Para ello se requiere implementar/activar un feed de instrumentos (la extensión TCP 10110 se documenta como futura). Hasta entonces, cada equipo opera con sus fuentes. |
| **3. Ambos a bordo; Wi‑Fi sin NMEA y Desktop tampoco tiene datos** | Puede haber LAN/hotspot y Link, pero no fuente externa compartida. | Android puede enviar posición/tracks a Desktop por Link; ambos mantienen funciones locales. Indicar ausencia de feed; no fabricar telemetría. |
| **4. Ambos a bordo; sin Wi‑Fi, sin Internet, NMEA solo en Desktop** | Link no conecta por la ruta LAN documentada. Bluetooth no está confirmado. | Desktop conserva NMEA; Android usa sensores locales/offline. La alternativa BT requiere implementación y ensayo; no se da por funcional. |
| **5. Ambos a bordo; sin Wi‑Fi, sin Internet y sin NMEA** | Sin canal Link PC↔Android; GT6 podría seguir con Android vía Wear Engine. | Tres equipos usan funciones locales disponibles. El móvil conserva diario de tracks para sincronizar al recuperar Link. |
| **6. Desktop en casa, Android en barco; ambos con Internet** | No comparten LAN, por tanto Link local no aplica. | Cloud podría sincronizar rutas/configuración solo si esa capacidad se implementa y autoriza. No reutilizar Link por Internet ni subir telemetría continua por defecto. |
| **7. Desktop en casa; Android en barco sin Internet** | Sin LAN común ni cloud. | Android autónomo con datos offline y sensores locales; diario/outbox conserva cambios duraderos. Link no conecta a través de redes separadas. |
| **8. Ambos con Internet pero en redes separadas** | Cloud disponible; Link local no. | Solo sync cloud de datos aprobados. Un Desktop remoto no es feed actual de navegación salvo diseño separado con política de privacidad/latencia. |
| **9. Misma Wi‑Fi con aislamiento de clientes/firewall** | Anuncio UDP o conexión TCP pueden fallar aunque ambos muestren Wi‑Fi conectado. | Usar IP manual si el broadcast está bloqueado, según protocolo; si TCP está aislado, Link permanece desconectado. UI distingue Wi‑Fi de sesión Link autenticada. |
| **10. Pérdida/recuperación de Wi‑Fi o cambio de IP durante Link** | Android aplica retry, callback Wi‑Fi y discovery; Desktop revisa interfaces y listeners. | Reautenticar, validar identidad de Desktop, negociar sesión y ejecutar `SYNC_REQUEST`/`SYNC_STATE`. Medir el intervalo hasta recuperación y asegurar que no se pierde ni duplica el diario. Ver sección 7. |


## 4. Arquitectura lógica objetivo

```text
Gateway NMEA / Signal K ──> Desktop y/o Android (según conectores reales)
GNSS Android ──> VELARISdroid ── VELARIS Link v1 (LAN) ──> VELARIS Desktop
                                  posición, tracks, eventos
                                  diario local → ACK/cursor reanudable

Android ── Huawei Wear Engine P2P ──> VELARIS GT6

Supabase/Internet: cuenta y sync cloud de datos duraderos seleccionados
                   (no requerido para Link local; separado del feed NMEA)
```

### Responsabilidades actuales y extensiones

- **VELARIS Link v1 actual:** Desktop es servidor; Android es cliente. TCP 47811 WebSocket, UDP 47812 discovery; pairing de código temporal con aprobación en Desktop, HMAC y credenciales locales cifradas. Mensajes cubren posición móvil hacia Desktop y sync de tracks/eventos con ACK/cursor.
- **Android:** el `TrackJournal` conserva datos antes de transmitir; la grabación no depende de Link. Al recuperar sesión, `SYNC_REQUEST`/`SYNC_STATE` permite reanudar. Android puede seleccionar una ruta Wi‑Fi local hacia el host y reintentar.
- **Desktop:** escucha en IPv4 privada y loopback cuando Link está activado. Elimina/recrea listeners según interfaces. Su servidor de cartas/API en 8089 permanece conceptualmente separado.
- **Feed de instrumentos:** compartir NMEA del Desktop hacia Android no forma parte de los tipos Link v1 documentados. La propuesta de servir NMEA0183 TCP 10110 es una extensión independiente a validar; evitar bucles si Android también publica posición.
- **GT6:** mantener Android como relay Wear Engine y evitar conexión directa del reloj con Desktop/cloud. Contrastar protocolo/frescura real en el repositorio GT6 actual.
- **Cloud:** rutas, configuración u otras entidades duraderas requieren diseño de identidad, autorización y reconciliación por separado. Link local no usa Supabase.


## 5. Fuente, calidad y frescura por campo

No asumir que una sola fuente alimenta toda la pantalla. GNSS del Android puede entregar posición mientras heading viene de una brújula NMEA y AIS de un receptor separado. Para cada campo (por ejemplo posición, SOG, COG, heading, viento, profundidad, AIS) registrar:

- `value` y unidad canónica explícita;
- `validity`: `VALID`, `INVALID`, `UNKNOWN` o `UNAVAILABLE`;
- `sourceId`, tipo de fuente y referencia (por ejemplo heading verdadero/magnético, datum para posición);
- `observedAt`: instante UTC en que se midió/calculó en origen;
- `receivedAt`: instante en que este nodo recibió el dato;
- contador/secuencia de origen si está disponible;
- calidad e incertidumbre cuando la fuente la proporcione;
- política TTL/caducidad por tipo de dato.

`observedAt` no se reemplaza por hora de recepción. `receivedAt` permite diagnosticar transporte; la edad para operación se calcula desde observación, considerando desfase de reloj y datos que no proporcionan timestamp fiable. Si no se puede confiar en hora de origen, marcar incertidumbre y no presentar precisión falsa. Las cadencias y TTL concretos deben definirse por campo a partir de los feeds reales; no congelarlos con valores inventados.

### Selección y fallback

1. Cada campo tiene una lista ordenada de fuentes permitidas por barco/dispositivo y criterio documentado (calidad, estado, configuración del usuario).
2. Una lectura inválida, fuera de orden o vencida no desplaza una lectura válida más reciente solo por llegar después.
3. Si la fuente preferida caduca, hacer fallback a otra fuente válida; registrar la transición. Si no hay alternativa, publicar `STALE`/`UNAVAILABLE` y conservar por separado el último valor histórico con su edad.
4. Fuentes con referencias o unidades incompatibles no se mezclan sin conversión explícita y verificable.
5. AIS y valores de otros blancos mantienen identidad y timestamp por objeto; no convertir la última posición recibida en seguimiento actual sin edad.

### Envelope de transporte orientativo

```json
{
  "schemaVersion": 1,
  "messageId": "uuid",
  "kind": "navigation.snapshot",
  "boatId": "uuid",
  "hubId": "uuid",
  "sequence": 1842,
  "observedAt": "2026-10-13T12:00:00.000Z",
  "publishedAt": "2026-10-13T12:00:00.040Z",
  "fields": {
    "position": {
      "value": { "latDeg": 36.5, "lonDeg": -6.2, "datum": "WGS84" },
      "validity": "VALID",
      "sourceId": "gnss-01",
      "observedAt": "2026-10-13T12:00:00.000Z",
      "receivedAt": "2026-10-13T12:00:00.020Z"
    }
  }
}
```

Es un ejemplo conceptual, no un contrato cerrado ni JSON Schema listo para producción. Antes de congelarlo hay que acordar unidades, magnitudes, nullabilidad, referencias, límites, timestamps, compatibilidad y comportamiento de campos desconocidos en TypeScript, Kotlin y Lite JS.

## 6. Sincronización y persistencia

### Estado actual confirmado de Link v1

- Android escribe los puntos en un diario local antes de considerarlos registrados.
- Al conectar, Android pide `SYNC_STATE` del Desktop, retoma desde el cursor contiguo y envía lotes; Desktop confirma con `ACK` después de persistir. Reenviar es idempotente por `(track, seq)` y `eventId`.
- El ACK no hace que Android borre el diario. Si Desktop tiene una copia parcial, Android reenvía desde el cursor; si Desktop perdió los datos, puede enviarlos desde el inicio según `PROTOCOL.md`.
- `POSITION` es efímero, va Android→Desktop, no requiere ACK y no se guarda como punto de track por Link.

### Objetivo general del ecosistema

Separar tres clases de datos:

| Clase | Ejemplos | Política objetivo |
|---|---|---|
| Efímeros de navegación | Posición viva, NMEA, AIS, rumbo/profundidad. | Local/volátil con fuente y edad; transporte por LAN solo mediante capacidad definida. No cloud continuo por defecto. |
| Duraderos colaborativos | Rutas, waypoints, preferencias. | Persistencia local y outbox idempotente; sync cloud diferida cuando se diseñe y autorice. Link v1 no sincroniza hoy todas estas entidades. |
| Tracks/eventos | Track móvil, puntos, bitácora. | Persistencia local Android y réplica Android→Desktop por protocolo Link actual; cloud es extensión separada. |

Para cualquier sincronización cloud futura: validar membresía y `boatId` del lado servidor, tener cursor por destino, tombstones/conflictos por entidad y conservar la copia local ante errores. Al reanudar Link, autenticar y crear sesión nueva antes de sync; persistir antes de ACK. No subir posiciones/AIS de forma continua por defecto.


## 7. Reconexión de VELARIS Link tras pérdida de Wi‑Fi

### Mecanismos confirmados en código actual

- `LinkClient` mantiene el deseo de conexión vinculada y reintenta con demoras de 1, 2, 4, 8 y 15 segundos; un corte tras una sesión conectada reinicia el contador. No hay jitter en la lista observada.
- `LinkManager` registra callback para redes Wi‑Fi aunque no tengan Internet, guarda subred/IP y elige una `SocketFactory` para la red que contiene la IP del Desktop. La ruta se vuelve a consultar en cada intento.
- Al aparecer una Wi‑Fi nueva/cambiar IP, Android puede reintentar inmediatamente si está esperando o conectando. `LinkDiscovery` escucha anuncios; si encuentra el mismo `desktopId` en otra IP, actualiza endpoint. La IP directa sigue siendo posible cuando falla el broadcast.
- Android detecta silencio por heartbeat; el protocolo define heartbeat cada 5 s y conexión obsoleta tras 15 s. Después crea una sesión autenticada nueva; al recibir `WELCOME`, solicita sincronización del diario.
- Desktop revisa interfaces cada 10 s, escucha solo en IPv4 privadas/loopback y agrega/quita listeners según la interfaz. Al retirar listener, las conexiones de ese listener se terminan; el cliente Android debe recuperarse.

### Riesgo/pendiente concreto

La ruta `networkLost()` observada en Android solo registra el evento; no fuerza cierre ni reintento inmediato si el WebSocket todavía parece abierto. En ese caso la detección puede esperar al fallo del socket o al umbral de stale/heartbeat (hasta 15 s según protocolo). El estado exacto puede variar por callback del sistema y comportamiento del AP. Existe una carpeta `backup-before-link-reconnect-20261013` que indica trabajo reciente, pero su nombre por sí solo no demuestra resultados ni aceptación.

Por tanto, **la reconexión existe en implementación, pero su recuperación tras Wi‑Fi apagada/cambiada necesita validación reproducible y aceptación de producto**. No se debe describir como “Link no reconecta” sin logs de una reproducción concreta ni como “resuelto” solo por la presencia de reintentos.

### Criterios de validación

1. Registrar estados y tiempos: Wi‑Fi `onLost`, socket failure/close, `WAITING_RETRY`, intento, `WELCOME`, cursor y fin de sincronización.
2. Probar apagar/encender Wi‑Fi, cambiar AP/SSID, cambio DHCP/IP, aislamiento de clientes, pérdida de WAN con LAN activa, suspensión/reactivación Android y reinicio Desktop.
3. Confirmar que el callback usa la subred/ruta correcta cuando Wi‑Fi no tiene Internet y que el discovery actualiza endpoint solo para el Desktop vinculado.
4. Medir intervalo desde pérdida real a estado desconectado y a `CONNECTED`; definir umbral de aceptación explícito. Confirmar que UI no mantiene “conectado” más allá del criterio de freshness.
5. Verificar que cada sesión nueva negocia/authentica, pide sync y no omite ni duplica puntos/eventos; offline diario permanece intacto.
6. Evaluar si la pérdida de red debe cancelar WebSocket y disparar retry de inmediato; si se modifica, cubrir carrera entre redes concurrentes y callbacks tardíos protegidos por generación.
7. No cambiar protocolo, security ni retry policy hasta correlacionar logs de Desktop y Android del caso reportado.


## 8. Seguridad y confianza

- Mantener separado el listener VELARIS Link de cartas/API Desktop (8089) y de endpoints administrativos. Link ya tiene servidor propio y controles específicos; no inferir que esos controles protejan otras rutas.
- Revalidar hallazgos históricos sobre contraseñas, CORS, host y rutas administrativas antes de cualquier exposición LAN. No guardar credenciales de cuenta en claro ni incluir service-role en clientes.
- Pairing Link v1: código temporal de un solo uso, máximo de intentos y aceptación explícita en Desktop; token aleatorio por dispositivo cifrado con DPAPI/safeStorage en PC y Android Keystore en móvil. El reto-respuesta HMAC evita reenviar el token en cada conexión; revocación corta sesiones.
- El canal actual es `ws://`, no WSS. `PROTOCOL.md` reconoce riesgo de captura de credenciales durante vinculación/ataque activo en LAN y propone TLS con huella anclada como mejora futura. Registrar como riesgo abierto hasta implementar y validar una solución con rotación/revocación.
- No exponer Link a Internet ni usarlo para redes separadas. Descubrimiento UDP solo localiza; no autentica. El Desktop limita escucha a IPv4 privadas y loopback, y Link requiere activación explícita.
- Cloud futura: Supabase Auth y RLS si se confirma como identidad canónica; autorizar por membresía `user_id`↔`boat_id`. El pairing local y la cuenta cloud son dominios de autorización distintos.
- No compartir JWT de cuenta con GT6. Minimizar ubicación/AIS en cloud; excluir telemetría continua por defecto y definir consentimiento/retención para cualquier acceso remoto futuro.
- Tipos Link v1 son acotados. No añadir comandos de navegación o control de piloto automático sin diseño de amenaza, autorización explícita, confirmación y pruebas de seguridad independientes.


## 9. Estados de interfaz

Exponer estados separados para **red**, **Link**, **fuente náutica**, **cloud sync** y **GT6**. Un único icono “online” es insuficiente.

| Estado | Significado | Presentación requerida |
|---|---|---|
| `LOCAL_ONLY` | Fuentes locales activas; sin canal PC↔Android. | “Navegación local”; identificar fuentes disponibles. |
| `CONNECTING` | Descubrimiento/handshake en curso. | Progreso breve, acción cancelar/reintentar. |
| `LINK_READY_NO_DATA` | Link autenticado, pero no hay feed o campos válidos. | “Enlace listo · sin datos náuticos”; no confundir con navegación conectada. |
| `LIVE` | Canal y al menos los campos declarados están frescos. | Mostrar fuente/edad por campo o acceso inmediato al detalle. |
| `DEGRADED` | Link sigue o volvió parcialmente, campos fuente vencidos o fallback activo. | Resaltar campos stale/fallback y origen actual. |
| `DISCONNECTED` | Canal no disponible. | Mostrar último contacto; permitir reconectar; no mostrarlo como actual. |
| `SYNC_PENDING` | Cambios duraderos guardados localmente y pendientes de cloud. | Indicador discreto; acceso a cola/error recuperable. |
| `SYNC_ERROR` | Cloud rechazó o no pudo reconciliar. | Explicar entidad y acción segura; conservar copia local. |
| `WATCH_LOCAL` / `WATCH_LINKED` / `WATCH_STALE` | GT6 autónomo, recibiendo o con datos recibidos vencidos. | Mostrar estado/fuente; nunca atribuir al reloj autoridad mayor que la fuente. |

Colores no serán el único indicador (legible en guardia/nocturno); acompañar con texto/icono y evitar alertas ruidosas por cambios transitorios. Mensajes críticos de navegación deben conservar origen y edad.

## 10. Decisiones pendientes

1. **Reconexión:** definir umbral aceptable de desconexión visible y recuperación tras pérdida/cambio Wi‑Fi; reproducir el caso reportado y decidir si `networkLost` debe forzar retry inmediato.
2. **Feed instrumentos Desktop→Android:** confirmar si hace falta en la primera entrega. La extensión TCP 10110 mencionada en `PROTOCOL.md` no es el canal Link v1 descrito; definir transporte, formatos, dirección, prevención de bucles y selección de fuente.
3. **Desktop como hub:** ¿los datos deben estar disponibles con el PC apagado? Si sí, se requiere gateway autónomo o conexión Android directa al gateway.
4. **Bluetooth PC↔Android:** decidir prioridad; concretar BLE/Classic, perfiles/APIs por sistema, pairing, reconexión y coexistencia de radios con GT6. No considerarlo existente hasta esa decisión y ensayos.
5. **Seguridad Link:** prioridad y diseño de TLS con huella anclada, distribución/rotación/revocación y protección de pairing sobre LAN hostil.
6. **Identidad/cloud:** confirmar Supabase Auth canónico tras inventario Firebase y estado Android actual; definir migración y entidades que sincronizan.
7. **Fuentes:** catálogo real de gateways y sentences/PGN por barco, qué campo aporta cada uno y reglas de calidad/prioridad.
8. **Contrato por campo:** unidades, referencias, datum, timestamps y TTL; compatibilidad Desktop/Android/GT6.
9. **Persistencia cloud:** política de conflictos, tombstones, retención, privacidad y acceso remoto si se aprueba.
10. **GT6:** revisar código/build vigente, payload, freshness, fallback local y límites de alertas.


## 11. Plan incremental y gates

| Fase | Entregable | Gate para avanzar |
|---|---|---|
| **0 · Evidencia de estado actual** | Contrastar auditoría histórica con repos actuales; reproducir pérdida Wi‑Fi Link; revisar identidad y seguridad. | Hallazgos abiertos/resueltos con evidencia; no confundir el puerto 8089 con Link. |
| **1 · Contrato y frescura por campo** | Definir qué feeds se comparten, unidades, procedencia, timestamps y estados; fixtures compatibles entre productos. | No hay valores sin fuente/unidad; UI diferencia edad y disponibilidad. |
| **2 · Autonomía y Link v1 existente** | Mantener operación local y diario Android; estabilizar activación, pairing, retry, endpoint discovery y sync cursor. | Casos offline, suspensión, cambio de AP/IP y reinicio Desktop recuperan sesión; track/eventos idempotentes y completos. |
| **3 · Seguridad LAN** | Resolver riesgo `ws://` mediante solución TLS/pinning revisada o decisión explícita de mitigación; revisar pairing y listeners. | Threat review y pruebas de conexión/revocación; Link no se amplía a Internet. |
| **4 · Feed náutico PC→Android (si se aprueba)** | Diseñar e implementar canal de instrumentos independiente o extensión versionada; prevenir bucles y conservar procedencia por campo. | Ensayos con gateway/PC offline, feeds duplicados y datos stale. |
| **5 · Identidad y cloud sync** | Decidir IdP; Auth Android si procede; persistencia y reconciliación cloud de entidades aprobadas. | Autorización por barco; offline y reintentos idempotentes; cloud no es requisito para Link. |
| **6 · GT6** | Verificar/ajustar contrato Android↔reloj, timestamps origen/recepción y fallback. | Pruebas en GT6 real con suspensión, datos atrasados y pérdida de móvil. |
| **7 · Bluetooth (opcional)** | Prototipo de transporte directo si se prioriza sobre LAN. | Compatibilidad, seguridad, coexistencia y recuperación medidas en hardware objetivo. |
| **8 · Prueba a bordo y release** | Red real, guardias diurnas/nocturnas, cortes de alimentación, builds firmados y rollback. | Go/No-Go documentado; equipos homologados siguen como referencia primaria. |

Las fechas se asignan después de estimación de los repositorios/equipos; no se heredan fechas de la auditoría previa como compromiso.


## 12. Criterios globales de aceptación

- Desktop, Android y GT6 identifican claramente sus fuentes activas, referencia/unidad y edad.
- La ausencia de Internet no deshabilita la navegación local, el mapa offline ni el enlace LAN local.
- Wi‑Fi conectado sin feed se representa distinto de feed vivo; Wi‑Fi aislado no aparenta Link funcional. Link v1 conectado no implica recepción de NMEA Desktop→Android.
- Desconexión y reconexión no hacen pasar muestras antiguas por nuevas; `SYNC_STATE`/cursor preceden al reenvío de puntos y eventos tras cada nueva sesión.
- Sync de rutas/configuración es durable, idempotente, autorizada y recuperable tras cierre abrupto.
- Un dispositivo sin fuente no fabrica un dato por copiar el último valor de otro campo/fuente.
- El feed LAN no expone rutas privilegiadas ni requiere credenciales de servicio en los clientes.
- La experiencia Android/GT6 conserva fallback propio; la suite no se presenta como sustituto de equipos náuticos homologados.

## 13. Referencia del material revisado

- `C:\PROYECTO GAULOS\VELARIS-Link\PROTOCOL.md`: contrato Link v1, puertos TCP 47811/UDP 47812, autenticación, heartbeat, tipos de mensaje y sync local.
- `C:\PROYECTO GAULOS\VELARIS\link\linkServer.js` y `linkMain.js`: listeners, lifecycle, pairing y superficie IPC.
- `C:\PROYECTO GAULOS\VELARISdroid\app\src\main\java\com\velaris\droid\core\link\LinkManager.kt` y `LinkClient.kt`: callback Wi‑Fi, ruta de red, reconexión y cliente de protocolo.
- `output/VELARIS_Auditoria_Interconexion.md`: auditoría estática del 11 de octubre, útil como contexto histórico para Desktop/Auth/GT6 y hallazgos de seguridad; debe verificarse contra el estado actual.
- Conversación referenciada “Presentación de unificación de apps”: considera ambos dispositivos a bordo con Wi‑Fi que puede o no compartir NMEA, Desktop con datos NMEA aunque no haya Wi‑Fi, ausencia de Internet/NMEA con posible Bluetooth, y Desktop en casa con Android en barco. Se amplían aquí los casos de aislamiento Wi‑Fi, pérdida/reconexión, fuentes parciales, operación autónoma y sincronización diferida.
- `output/VELARIS_Arquitectura_Integracion_Apps.pptx`: presentación de referencia presente en el espejo. No se ha modificado.

---

**Próxima acción documental:** integrar este archivo en la raíz de `C:\PROYECTO GAULOS\VELARIS`. Se revisó el protocolo y el código de reconexión; queda reproducir el escenario en hardware y revisar el estado actual de Android Auth, Desktop y GT6. No se ha modificado código ni ejecutado tests/builds en esta tarea.




\n\n
