// One colour per sport on the Calendar (spec #20, story 35). Fixed for the
// sports Belgium is most often seen in, so they stay apart; any other sport
// gets a stable colour from its name.

const FIXED: Record<string, string> = {
  Athletics: "#c0392b",
  Swimming: "#1f78b4",
  "Speed skating": "#1f3a93",
  "Short track": "#6a3d9a",
  Hockey: "#1b7a35",
  "Cycling road": "#e67e22",
  "Track cycling": "#d35400",
  Judo: "#34495e",
  Taekwondo: "#8e44ad",
  Biathlon: "#16a085",
  "Alpine skiing": "#5d6d7e",
  Equestrian: "#8d6e63",
  Triathlon: "#00838f",
  Badminton: "#b7950b",
  Gymnastics: "#ad1457",
  Rowing: "#0277bd",
  "Figure skating": "#7b1fa2",
  "3x3 basketball": "#ef6c00",
  Tennis: "#689f38",
  Sailing: "#00695c",
};

const SPARE = ["#a93226", "#1a5276", "#7d6608", "#4a235a", "#0e6655", "#6e2c00", "#424949", "#943126", "#1b4f72", "#145a32"];

export function sportColour(sport: string): string {
  if (FIXED[sport]) return FIXED[sport];
  let h = 0;
  for (const ch of sport) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPARE[h % SPARE.length];
}
