/** One colour as its maker sells it. */
export interface MakerColor {
  name: string;
  code: string; // the maker's colour number / code ("" when they don't publish one)
  hex: string; // on-screen approximation, not a colour-managed proof
}

/** A maker's colour line, offered as preset palettes in the Palette Library. */
export interface ColorLibrary {
  id: string;
  maker: string; // "Toho", "Miyuki", "Harrisville Designs"…
  line: string; // "Round 11/0", "Delica 11/0", "Shetland"…
  kind: string; // shown in the library's Kind column: "Bead colours", "Yarn colours"
  fullName: string; // preset name for the whole line
  essentialsName?: string; // preset name for the everyday subset
  colors: MakerColor[];
  essentials?: string[]; // codes (or names, when codes are empty) of the subset
}
