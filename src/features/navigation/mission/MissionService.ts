export interface StartMissionOptions {
  modo: "Libre" | "IA";
  levels?: {
    fuel_level: number;
    water_level: number;
  };
  crew?: any[];
  userProfile: any;
  selectedShipId: string | null;

  setCrewOnBoard: (crew: any[]) => void;
  setPendingTravesiaData: (data: any) => void;
  setShowWatchSelection: (show: boolean) => void;

  proceedWithStartTravesia: (
    modo: "Libre" | "IA",
    levels?: {
      fuel_level: number;
      water_level: number;
    }
  ) => Promise<void>;
}

export class MissionService {
  static async handleStartTravesia({
    modo,
    levels,
    crew,
    userProfile,
    selectedShipId,
    setCrewOnBoard,
    setPendingTravesiaData,
    setShowWatchSelection,
    proceedWithStartTravesia,
  }: StartMissionOptions) {
    console.log("MissionService.handleStartTravesia()", {
      modo,
      userProfile,
      selectedShipId,
      levels,
      crew,
    });

    const activeCrew =
      crew && crew.length > 0
        ? crew
        : userProfile
        ? [
            {
              id: "captain-" + userProfile.id,
              nombre: userProfile.name,
              rango: "Capitán",
              is_captain: true,
            },
          ]
        : [];

    if (activeCrew.length > 0) {
      console.log(
        "MissionService: Transitioning to Watch Selection",
        activeCrew.map((c) => c.nombre)
      );

      setCrewOnBoard(activeCrew);
      setPendingTravesiaData({ modo, levels });
      setShowWatchSelection(true);

      return;
    }

    console.log(
      "MissionService: No crew available, starting directly"
    );

    await proceedWithStartTravesia(modo, levels);
  }
}