/**
 * Construye la muestra del VoyageMonitor a partir del estado de navegación compartido.
 * Solo los campos cuya fuente efectiva es BOAT (instrumentos del barco: puerto serie o TCP
 * declarado como barco) y que están vigentes pueden iniciar o alimentar una travesía.
 * El GPS del teléfono (DROID) y el simulador visual (SIMULATOR) nunca la inician.
 */
import type { ResolvedNavigationField, ResolvedNavigationState } from "../navigation/SharedNavigationState";
import type { VoyageSample } from "./VoyageMonitor";

function boatValue<T>(field: Pick<ResolvedNavigationField, "status" | "source"> & { readonly value: T | null }): T | null {
    return field.status === "VALID" && field.source === "BOAT" ? field.value : null;
}

export function voyageSampleFromNavigation(
    navigation: ResolvedNavigationState,
    now: number,
    voyageActive: boolean,
    boatOrigin: string | null = null
): VoyageSample {
    return {
        now,
        voyageActive,
        boatPosition: boatValue(navigation.position),
        boatSog: boatValue(navigation.sog),
        boatCog: boatValue(navigation.cog),
        positionSource: navigation.position.status === "VALID" ? navigation.position.source : null,
        boatOrigin
    };
}


/** El estado remoto no cierra una travesía que gobiernan los instrumentos locales. */
export function reconcileVoyageActivity(localActive: boolean, remoteActive: unknown, autoStarted: boolean): boolean {
    if (autoStarted && localActive) return true;
    return typeof remoteActive === 'boolean' ? remoteActive : localActive;
}
