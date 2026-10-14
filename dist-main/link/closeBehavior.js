// @ts-check
'use strict';
/**
 * Ciclo de vida de la ventana principal de VELARIS Desktop (D4).
 *
 * Cerrar la ventana NO cierra la aplicación: la oculta y deja VELARIS Link activo en la bandeja del
 * sistema. La única salida real es la opción explícita «Salir» de la bandeja (o app.quit() desde el
 * actualizador / el sistema, que dispara `before-quit` y marca la salida). Módulo puro, sin Electron,
 * para poder probarlo.
 */
/**
 * @param {{ hideWindow: () => void, onFirstHide?: () => void }} hooks
 */
function createCloseBehavior(hooks) {
    let quitting = false;
    let hiddenBefore = false;
    return {
        /** Se llama desde el evento `close` de la ventana. Devuelve qué ha ocurrido. */
        onWindowClose(/** @type {{ preventDefault: () => void }} */ event) {
            if (quitting)
                return 'closing';
            event.preventDefault();
            hooks.hideWindow();
            if (!hiddenBefore) {
                hiddenBefore = true;
                hooks.onFirstHide?.();
            }
            return 'hidden';
        },
        /** Se llama desde `before-quit`: a partir de aquí las ventanas se cierran de verdad. */
        markQuitting() {
            quitting = true;
        },
        /** ¿Debe la aplicación terminar cuando ya no quedan ventanas? Solo si se pidió salir. */
        shouldQuitWhenAllWindowsClosed() {
            return quitting;
        },
        isQuitting() {
            return quitting;
        }
    };
}
/**
 * Plantilla del menú de la bandeja. «Salir» es siempre explícito y es la única vía de salida desde la bandeja.
 * @param {{ linkEnabled: boolean, devices: number, show: () => void, quit: () => void }} options
 */
function buildTrayMenuTemplate(options) {
    const linkLabel = options.linkEnabled
        ? `VELARIS Link: activo · ${options.devices} ${options.devices === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}`
        : 'VELARIS Link: desactivado';
    return [
        { label: 'Abrir VELARIS', click: options.show },
        { type: 'separator' },
        { label: linkLabel, enabled: false },
        { type: 'separator' },
        { label: 'Salir', click: options.quit }
    ];
}
module.exports = { createCloseBehavior, buildTrayMenuTemplate };
