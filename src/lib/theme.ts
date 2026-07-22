export const color = {
  crimson50: "#FAF0EF",
  crimson100: "#F3DDDA",
  crimson600: "#A31C12",
  crimson700: "#8C0000",
  crimson800: "#6E0000",
  bg: "#F7F5F3",
  surface: "#FFFFFF",
  divider: "#F0EDEA",
  border: "#E8E4E0",
  borderInput: "#D6D1CC",
  text1: "#1C1917",
  text2: "#5C5652",
  text3: "#8A837D",
  star: "#E0A400",
  starBg: "#FBF4DF",
  successBg: "#EAF3ED",
  successFg: "#2F7A4F",
} as const;

export const campusColor: Record<string, string> = {
  "인문사회계": "#963A32",
  "자연계": "#315E96",
  "녹지캠퍼스": "#3E7A46",
  "의료원": "#85477C",
};

export const facilityColor = {
  elevator: "#2D5FB0",
  restroom: "#2F7A4F",
  ramp: "#B25617",
  parking: "#6D4AB0",
  braille: "#8A6A00",
} as const;

export function slopeColor(absSlopePct: number) {
  const slope = Math.abs(absSlopePct);
  if (slope <= 1) return "#B5AFA8";
  if (slope <= 2) return "#DDC26A";
  if (slope <= 5) return "#D89A3A";
  if (slope <= 8.33) return "#C96C24";
  if (slope <= 12) return "#AE3B1E";
  return "#7A1414";
}

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const shadow = {
  raised: "0 1px 3px rgba(28,25,23,0.10)",
  floating: "0 4px 16px rgba(28,25,23,0.12)",
  overlay: "0 12px 32px rgba(28,25,23,0.16)",
} as const;

export const focusRing = {
  borderColor: color.crimson700,
  boxShadow: `0 0 0 3px ${color.crimson100}`,
} as const;
