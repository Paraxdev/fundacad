// The printed-Texture tool's panel, minus the panel: the value shape, the
// mapping between it and the form fields, and the conditional-visibility rules
// that decide which rows a given kind/profile combination even has.
//
// Split out of texturePanel.ts when that became a facade over
// components/overlays/TextureToolPanel.vue. The visibility rules are the part
// worth testing: they encode sidecar behaviour (a FACETED wave has no shape
// parameter at all) and one fixed bug (Direction applies to every kind, not
// just the lattice ones).

export type TextureKind = "knurl" | "hex" | "waves" | "ribs" | "voronoi" | "noise" | "image";
export type TextureMode = "faces" | "body";

export interface TextureValues {
  kind: TextureKind;
  depth: number;
  scale: number;
  angle: number;
  offset: number;
  sharpness: number;
  profile: "facet" | "round";
  boundaryInset: number;
  direction: "out" | "in" | "both";
  seed: number;
  invert: boolean;
  imagePath?: string;
  colorSlot?: number; // palette slot for a two-tone inlay; undefined = body color
}

export const KIND_OPTIONS: [TextureKind, string][] = [
  ["knurl", "Knurl"],
  ["hex", "Hex"],
  ["waves", "Waves"],
  ["ribs", "Ribs"],
  ["voronoi", "Voronoi"],
  ["noise", "Noise (Perlin)"],
  ["image", "Image Heightmap"],
];
// kinds that show angle/sharpness (a lattice/wave orientation + crispness make
// sense for all of these; voronoi/noise use a seed instead of an orientation,
// and image has neither). Exported so textureTool.ts can trim the feature JSON
// to the fields that actually apply to the chosen kind.
export const ANGLE_KINDS = new Set<TextureKind>(["knurl", "hex", "waves", "ribs"]);
export const SEED_KINDS = new Set<TextureKind>(["voronoi", "noise"]);

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Live form state. Strings for every numeric field, because that is what the
 *  <input>s hold and a half-typed "0." is legitimate. */
export interface TextureForm {
  kind: TextureKind;
  profile: TextureValues["profile"];
  depth: string;
  scale: string;
  angle: string;
  sharpness: string;
  direction: TextureValues["direction"];
  seed: string;
  invert: boolean;
  imagePath: string; // "" = no file chosen
  colorSlot: string; // "" = the body colour
  offset: string;
  edgeBlend: string;
}

export function initialTextureForm(initial: Partial<TextureValues>): TextureForm {
  return {
    kind: initial.kind ?? "knurl",
    // Hard surface is the default: planar facets and real creases are what a
    // printer can actually reproduce. "Smooth" restores the original fields.
    profile: initial.profile ?? "facet",
    depth: String(initial.depth ?? 0.4),
    scale: String(initial.scale ?? 2),
    angle: String(initial.angle ?? 0),
    sharpness: String(initial.sharpness ?? 0.5),
    direction: initial.direction ?? "out",
    seed: String(initial.seed ?? 1),
    invert: initial.invert ?? false,
    imagePath: initial.imagePath ?? "",
    colorSlot: initial.colorSlot != null ? String(initial.colorSlot) : "",
    offset: String(initial.offset ?? 0),
    edgeBlend: String(initial.boundaryInset ?? 0),
  };
}

export function toTextureValues(f: TextureForm): TextureValues {
  return {
    kind: f.kind,
    depth: parseFloat(f.depth) || 0.4,
    scale: parseFloat(f.scale) || 2,
    angle: parseFloat(f.angle) || 0,
    offset: parseFloat(f.offset) || 0,
    sharpness: parseFloat(f.sharpness) || 0,
    profile: f.profile,
    boundaryInset: Math.max(0, parseFloat(f.edgeBlend) || 0),
    direction: f.direction,
    seed: parseFloat(f.seed) || 1,
    invert: f.invert,
    ...(f.imagePath ? { imagePath: f.imagePath } : {}),
    ...(f.colorSlot !== "" ? { colorSlot: Number(f.colorSlot) } : {}),
  };
}

/** Which optional rows a given form shows.
 *
 *  `direction` is deliberately absent: the sidecar applies it to the height
 *  field itself (out = h, in = h-1, both = centred), so EVERY kind honours it.
 *  Gating it behind ANGLE_KINDS left noise/voronoi/image able only to GROW the
 *  part — changing its dimensions instead of texturing the surface it sits on. */
export function textureRows(f: Pick<TextureForm, "kind" | "profile">) {
  return {
    angle: ANGLE_KINDS.has(f.kind),
    seed: SEED_KINDS.has(f.kind),
    image: f.kind === "image",
    // The same slider means different things per profile, so it says which —
    // and for one combination it means nothing at all, so it goes away rather
    // than sitting there dead: a FACETED wave is a fixed 8-join sine polyline
    // with no shape parameter (sidecar `_wave_levels` explains why). Under
    // `round`, waves is a real sine and sharpness still crisps it.
    sharpness: ANGLE_KINDS.has(f.kind) && !(f.profile === "facet" && f.kind === "waves"),
  };
}

export function sharpnessLabel(profile: TextureValues["profile"]): { text: string; title: string } {
  return profile === "facet"
    ? { text: "Land", title: "Flat land on the crests: 0 = pure V-groove peaks, 1 = wide flat tops" }
    : { text: "Sharp", title: "Crispness of the smooth profile" };
}
