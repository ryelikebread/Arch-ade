import type { Theme } from "../lib/theme";
import arcadeNight from "./arcade-night.json";
import highContrast from "./high-contrast.json";
import paper from "./paper.json";
import peaSoup from "./pea-soup.json";
import volcano from "./volcano.json";

/** Built-in themes; users can add more as JSON in <app data>/themes/. */
const themes: Theme[] = [arcadeNight, peaSoup, paper, highContrast, volcano] as Theme[];
export default themes;
