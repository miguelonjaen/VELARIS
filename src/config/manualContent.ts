import { CHANGELOG } from './changelog';

const novedadesVersion = CHANGELOG.map(entry => `
### Versión ${entry.version} (${entry.date})
${entry.title}
${entry.features.map(f => `* ${f.icon} [${f.category.toUpperCase()}] ${f.text}`).join('\n')}
`).join('\n');

export const MANUAL_MARKDOWN = `
# ⚓ MANUAL DEL ALMIRANTE: SMARTSHIP PRO
**Estación de Trabajo Integrada para el Puente de Mando**
*Edición Oficial de Operaciones Tácticas*

---

## 1. ⚓ ARQUITECTURA: EL CEREBRO DEL BUQUE
SmartShip PRO opera mediante un núcleo distribuido diseñado para la resiliencia en alta mar.
* **Interfaz React 19**: Respuesta instantánea para maniobras críticas.
* **Puente Electron**: Comunicación directa con hardware NMEA 0183/2000.
* **Cartografía Offline**: Servidor MBTiles local (Puerto 8089) para navegación sin internet.

## 2. 🎛️ HUD TÁCTICO: EL PULSO DEL BUQUE
El panel principal (HUB) procesa la telemetría en tiempo real:
* **SOG/COG**: Velocidad y rumbo real sobre el fondo.
* **TWD/TWS**: Cálculo vectorial del viento real (imprescindible para táctica de vela).
* **Rendimiento VMG**: Ganancia real hacia barlovento basada en polares.

## 🚨 3. SEGURIDAD CRÍTICA: PROTOCOLOS NUCLEUS
### 3.1 Protocolo MOB (Hombre al Agua)
Activación inmediata mediante botón rojo. Fija coordenadas GPS, calcula rumbo de retorno y despliega la Maniobra de Anderson en el mapa.

### 3.2 Guardián de Fondeo
Utiliza algoritmos de regresión lineal para analizar la tendencia de las últimas 30 posiciones y detectar garreo preventivo antes de abandonar el radio de borneo.

## ⛵ 4. ASESOR TÁCTICO Y NAVEGACIÓN IA
El sistema analiza el entorno meteorológico para sugerir:
* **Laylines**: Líneas de rumbo óptimo para ceñida.
* **Rizado de velas**: Alertas automáticas al superar los 25 nudos.
* **Derrotas IA**: Cálculo de rutas evitando bajos y optimizando el tiempo de llegada.

## 💾 5. CAJA NEGRA Y BITÁCORA LEGAL
Registro automatizado cada 10 minutos. Los datos se encriptan y se sincronizan con el búnker Supabase cuando hay cobertura, garantizando la trazabilidad jurídica de la travesía.

## 6. 🛠️ MANTENIMIENTO PREVENTIVO (HORAS DE MOTOR)
SmartShip PRO monitoriza las horas de funcionamiento de sus propulsores para garantizar la integridad mecánica. El sistema utiliza los siguientes intervalos estándar de mantenimiento preventivo:

* **Cada 50 Horas**: Revisión inicial de niveles, tensión de correas y estanqueidad de prensaestopas.
* **Cada 100 - 200 Horas**: Cambio de aceite del motor y filtros de combustible. Inspección del rodete (*impeller*) de la bomba de agua salada.
* **Cada 500 Horas**: Limpieza del circuito de refrigeración, inspección de ánodos de sacrificio internos y ajuste de válvulas.
* **Cada 1000 Horas**: Revisión mayor de inyectores, intercambiadores de calor y sistema de propulsión (cola/eje).

*Nota: El sistema emitirá alertas automáticas en el HUB Táctico cuando la telemetría detecte que se aproxima un hito de mantenimiento.*

## 7. 🦺 EQUIPAMIENTO DE SEGURIDAD OBLIGATORIO
El sistema permite monitorizar el cumplimiento del equipamiento obligatorio según la **Zona de Navegación** configurada para el buque:

*   **Zona 1 (Navegación Ilimitada)**: Balsa salvavidas, Radiobaliza (EPIRB), VHF con DSC, pirotecnia completa y chalecos de 150N.
*   **Zona 2-3 (60/25 millas)**: Balsa salvavidas, VHF fijo con DSC, pirotecnia específica y chalecos de 150N.
*   **Zona 4 (12 millas - Costa)**: VHF fijo, 3 bengalas, 3 cohetes, 1 señal fumígena y chalecos de 100N/150N.
*   **Zona 5-7 (Aguas Protegidas)**: Espejo de señales, bocina de niebla, extintores portátiles y chalecos de 100N.

*Recomendación Táctica: Utilice el módulo de **Inventario** para registrar las fechas de caducidad de bengalas y botiquín. El Asesor Táctico le notificará 30 días antes de cualquier vencimiento legal.*

---

## 📑 NOVEDADES DE LA VERSIÓN (CHANGELOG)
${novedadesVersion}

---
*Fin del documento. Buen viento y buena mar.*
`;
