export const getUpwindAngle = (tws: number) => {
  if (tws < 6) return 45;
  if (tws < 10) return 42;
  if (tws < 15) return 38;
  if (tws < 20) return 35;
  return 33;
};

export const getDownwindAngle = (tws: number) => {
  if (tws < 6) return 150;
  if (tws < 10) return 155;
  if (tws < 15) return 160;
  return 165;
};