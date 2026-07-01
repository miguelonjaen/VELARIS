import { GeoMath } from "./GeoMath";

export function testGeoMath() {

    const malaga = {
        lat: 36.7099,
        lng: -4.4200
    };

    const motril = {
        lat: 36.7215,
        lng: -3.5235
    };

    console.log("Distancia (m):", GeoMath.distanceMeters(malaga, motril));

    console.log("Distancia (NM):", GeoMath.distanceNM(malaga, motril));

    console.log("Rumbo:", GeoMath.initialBearing(malaga, motril));

}