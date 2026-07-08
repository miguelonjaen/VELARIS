import React from "react";
import { Polyline } from "react-leaflet";


interface FleetPredictionProps {

    simulatedAisTargets: any[];

}

export const FleetPrediction: React.FC<FleetPredictionProps> = ({
    simulatedAisTargets
}) => {

    return (

        <>
        {simulatedAisTargets.map((target) => {

        const predictionMinutes = 30;

        const riskColor =
            target.risk === "danger"
                ? "#ef4444"
                : target.risk === "caution"
                ? "#f59e0b"
                : "#22c55e";

        const distanceNm =
            target.sog * (predictionMinutes / 60);

        const cogRad =
            (target.cog * Math.PI) / 180;

        const bowOffset = 0.00008;

        const startLat =
            target.lat +
            bowOffset * Math.cos(cogRad);

        const startLng =
            target.lng +
            bowOffset * Math.sin(cogRad);

        const futureLat =
            target.lat +
            (distanceNm * Math.cos(cogRad)) / 60;

        const futureLng =
            target.lng +
            (distanceNm * Math.sin(cogRad)) /
            (60 * Math.cos(target.lat * Math.PI / 180));

        return (

            <Polyline
                key={`prediction-${target.mmsi}`}
                positions={[
                    [startLat, startLng],
                    [futureLat, futureLng]
                ]}
                color={riskColor}
                weight={2}
                opacity={0.7}
                 />

        );

    })}

        </>

    );

};