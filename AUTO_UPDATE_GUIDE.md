# 🔄 Guía de Auto-Update en VELARIS

## Estado Actual ✅

El sistema de auto-update está **completamente configurado** y listo para usar. Cuando subas una nueva release a GitHub, los usuarios recibirán automáticamente una notificación de actualización.

---

## 📋 Cómo Funciona

### 1. **Búsqueda Automática de Actualizaciones**
- Se ejecuta automáticamente al iniciar la app
- Solo en modo **producción** (app empaquetada)
- Verifica releases en: `https://github.com/miguelonjaen/VELARIS-pro/releases`

### 2. **Flujo de Actualización**
```
App inicia
    ↓
setupAutoUpdater() - Configura listeners
    ↓
checkForUpdates() - Busca nuevas releases en GitHub
    ↓
[Si existe actualización disponible]
    ↓
Descarga archivo .exe en background
    ↓
Notifica al usuario: "Nueva versión disponible"
    ↓
Usuario puede instalar (quitAndInstall) o posponer
    ↓
App reinicia e instala la nueva versión
```

### 3. **Eventos del Sistema**

| Evento | Descripción | Acción |
|--------|-------------|--------|
| `update-available` | Nueva versión encontrada | Notifica versión y notas de cambio |
| `download-progress` | Descargando actualización | Muestra progreso (%) |
| `update-downloaded` | Listo para instalar | Pide confirmación del usuario |
| `update-not-available` | Estás en última versión | Mensaje de confirmación |
| `error` | Fallo en búsqueda/descarga | Notifica error (con reintentos) |

---

## 🚀 Cómo Hacer una Release en GitHub

### **Paso 1: Incrementar Versión en package.json**

```bash
# Abre package.json y actualiza el campo version
# De: "version": "1.0.7"
# A:  "version": "1.0.8"
```

### **Paso 2: Compilar la Aplicación**

```bash
# Limpiar builds anteriores
npm run clean

# Compilar para Windows
npm run electron:build
# O específicamente:
npm run build-win
```

Esto genera: `dist_electron/VELARIS Setup 1.0.8.exe`

### **Paso 3: Crear Release en GitHub**

```bash
# Opción A: Usando GitHub CLI (recomendado)
gh release create v1.0.8 \
  --title "VELARIS v1.0.8" \
  --notes "Mejoras de navegación y correcciones de bugs" \
  dist_electron/VELARIS\ Pro\ Setup\ 1.0.8.exe

# Opción B: Usar la interfaz web de GitHub
# 1. Ve a: https://github.com/miguelonjaen/VELARIS-pro/releases/new
# 2. Crea "New Release"
# 3. Tag: v1.0.8
# 4. Title: VELARIS v1.0.8
# 5. Description: [notas de cambio]
# 6. Attach binaries: Arrastra el .exe
# 7. Publish Release
```

### **Paso 4: Validar Release** ✅

```bash
# Verificar que el archivo .exe está en la release
gh release view v1.0.8

# Resultado esperado:
# Tag: v1.0.8
# Assets:
#   VELARIS Setup 1.0.8.exe
```

---

## 🔍 Pruebas de Auto-Update

### **Test Local**

1. **En desarrollo:** Auto-update está DESHABILITADO (solo funciona en build empaquetado)

2. **Para probar sin recompilar:**
   ```bash
   # Edita electron-main.js temporalmente:
   if (!isDev) {  // Cambia a: if (true) {
   ```

3. **Buscar actualizaciones manualmente:**
   ```javascript
   // En la consola de DevTools:
   ipcRenderer.invoke('check-for-updates').then(result => {
     console.log('Resultado:', result);
   });
   ```

### **Verificar Logs**

Los logs de auto-update se guardan en:
- **Windows:** `%APPDATA%\VELARIS\logs\main.log`
- **macOS:** `~/Library/Logs/VELARIS/main.log`

Busca líneas con:
- `🔄 Actualización disponible`
- `⬇️ Descargando`
- `✅ Actualización descargada`
- `❌ Error`

---

## 📱 Experiencia del Usuario

### **Escenario 1: Hay Actualización Disponible**

```
Usuario abre VELARIS v1.0.7
    ↓
[Background] Se descarga v1.0.8
    ↓
Notificación: "⚙️ Nueva versión disponible (1.0.8)"
    ↓
Usuario elige: "Instalar ahora" o "Más tarde"
    ↓
Si elige "Instalar": App reinicia y actualiza
```

### **Escenario 2: Repo Privado (Requiere Token)**

Si el repo se vuelve privado, configura:

```bash
# En variables de entorno (antes de ejecutar):
export GITHUB_TOKEN=tu_token_github

# O en Windows:
set GITHUB_TOKEN=tu_token_github
```

El token se usará automáticamente en `setupAutoUpdater()`.

---

## 🔧 Configuración del Build (package.json)

```json
"build": {
  "appId": "com.VELARIS.pro",
  "productName": "VELARIS",
  "publish": [
    {
      "provider": "github",
      "owner": "miguelonjaen",
      "repo": "VELARIS-pro"
    }
  ],
  "win": {
    "target": "nsis"
  }
}
```

**Importante:** `publish.provider` debe ser `github` para que electron-updater busque releases en GitHub.

---

## ⚠️ Solución de Problemas

### **❌ "Actualización no se detecta"**

1. Verifica que la versión en GitHub sea MAYOR que la actual
2. Espera 5-10 minutos (GitHub CDN puede tener latencia)
3. Revisa los logs en `%APPDATA%\VELARIS\logs\main.log`
4. Confirma que el archivo `.exe` esté en la release de GitHub

### **❌ "Error: Cannot find matching version"**

- El nombre del archivo `.exe` debe coincidir exactamente con lo esperado
- Verifica que sea: `VELARIS Setup X.X.X.exe`
- No renombres el archivo después de compilar

### **❌ "Error: 403 Forbidden (repo privado)"**

- Si el repo es privado, configura `GITHUB_TOKEN` en variables de entorno
- El token debe tener permisos `repo` (lectura de releases)

### **❌ "Auto-update solo funciona en build empaquetado"**

- En desarrollo (`npm run electron:start`), auto-update está deshabilitado
- Es normal y por diseño (evita falsos positivos durante dev)
- Para probar con build empaquetado:
  ```bash
  npm run electron:build
  # Ejecuta dist_electron/VELARIS Setup.exe
  ```

---

## 📊 Monitoreo de Actualizaciones

### **IPC Events Disponibles para UI**

```javascript
// Escuchar notificaciones de actualización en React
window.ipcRenderer.on('update-available', (data) => {
  console.log('Nueva versión:', data.version);
  // Mostrar UI al usuario
});

window.ipcRenderer.on('download-progress', (data) => {
  console.log(`Descargando: ${data.percent}%`);
  // Actualizar barra de progreso
});

window.ipcRenderer.on('update-downloaded', (data) => {
  console.log('Actualización lista:', data.version);
  // Pedir confirmación antes de reiniciar
});

window.ipcRenderer.on('update-error', (data) => {
  console.error('Error:', data.message);
  // Mostrar error al usuario
});
```

---

## 🎯 Resumen de Configuración

| Componente | Estado | Detalles |
|-----------|--------|---------|
| **electron-updater** | ✅ Instalado | v6.8.3 |
| **electron-log** | ✅ Agregado | v5.1.2 (para debug) |
| **GitHub Provider** | ✅ Configurado | miguelonjaen/VELARIS-pro |
| **Event Listeners** | ✅ Implementados | update-available, error, etc. |
| **IPC Handlers** | ✅ Listos | check-for-updates, install-update, get-app-version |
| **Logging** | ✅ Habilitado | Guarda en `%APPDATA%\VELARIS\logs\` |
| **Build Config** | ✅ Correcto | package.json `publish.provider: github` |

---

## 🚀 Próximas Releases

### **Checklist antes de hacer Release**

- [ ] Increment version en `package.json`
- [ ] Ejecuta `npm run clean && npm run build-win`
- [ ] Verifica que el `.exe` se generó en `dist_electron/`
- [ ] Crea Release en GitHub con tag `v1.0.X`
- [ ] Adjunta el `.exe` a la release
- [ ] Publica la release
- [ ] Espera 5-10 minutos
- [ ] Abre VELARIS para verificar que detecta la actualización

---

**Última actualización:** 23 Mayo 2026  
**Versión:** 1.0.7 → Sistema listo para 1.0.8+
