// AUTO-GENERATED from `attached_assets/0)_KONTI_DESIGN_PRE-DESIGN_CONSTRUCTION_ESTIMATE_-_CLIENT_NAM_*.xlsx`
// MATERIALS sheet, rows 6-113. Source taxonomy locked at 2026-05-13.
//
// KONTi's canonical master materials list - the 19 categories and ~107 line
// items that every new project starts with. Per the 2026-05-11 meeting:
// "todos los materiales queden cargados por defecto en la calculadora".
//
// Per replit.md policy, seed.ts is read-only at runtime. This module sits
// alongside seed.ts and is referenced by the lead-accept handler to
// pre-populate the per-project calculator (P1.2).
//
// To refresh: re-run scripts/regenerate-master-materials.py after Jorge
// updates the source XLSX. Commit the updated file in a single commit.

import type { ReportBucketKey } from "@workspace/report-categories";

export type MasterMaterialCategoryKey =
  | "appliances"
  | "bathroom"
  | "consumables"
  | "container_purchase"
  | "cut_frames"
  | "decking"
  | "electrical"
  | "exterior_staircase"
  | "exterior_steel_structure"
  | "exterior_windows_and_doors"
  | "finishes"
  | "gas_connection"
  | "interior_build"
  | "interior_staircase"
  | "kitchen"
  | "painting"
  | "pergola"
  | "plumbing"
  | "structural_prep";

export interface MasterMaterialCategoryMeta {
  key: MasterMaterialCategoryKey;
  labelEn: string;
  labelEs: string;
  /** Top-level report bucket - matches `lib/report-categories`. */
  bucket: ReportBucketKey;
  /** Trade-level color key for the existing calculator `CAT_COLORS` map. */
  legacyTradeKey: "steel" | "lumber" | "electrical" | "plumbing" | "finishes" | "insulation" | "foundation";
}

export const MASTER_MATERIAL_CATEGORIES: ReadonlyArray<MasterMaterialCategoryMeta> = [
  { key: "appliances", labelEn: "Appliances", labelEs: "Electrodomesticos", bucket: "exterior_add_ons", legacyTradeKey: "finishes" },
  { key: "bathroom", labelEn: "Bathroom", labelEs: "Bano", bucket: "product_containers", legacyTradeKey: "plumbing" },
  { key: "consumables", labelEn: "Consumables", labelEs: "Consumibles", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "container_purchase", labelEn: "Container Purchase", labelEs: "Compra de Contenedor", bucket: "product_containers", legacyTradeKey: "steel" },
  { key: "cut_frames", labelEn: "Cut & Frames", labelEs: "Cortes y Marcos", bucket: "product_containers", legacyTradeKey: "steel" },
  { key: "decking", labelEn: "Decking", labelEs: "Terraza", bucket: "exterior_add_ons", legacyTradeKey: "lumber" },
  { key: "electrical", labelEn: "Electrical", labelEs: "Electrico", bucket: "product_containers", legacyTradeKey: "electrical" },
  { key: "exterior_staircase", labelEn: "Exterior Staircase", labelEs: "Escalera Exterior", bucket: "exterior_add_ons", legacyTradeKey: "steel" },
  { key: "exterior_steel_structure", labelEn: "Exterior Steel Structure", labelEs: "Estructura de Acero Exterior", bucket: "exterior_add_ons", legacyTradeKey: "steel" },
  { key: "exterior_windows_and_doors", labelEn: "Exterior Windows and Doors", labelEs: "Ventanas y Puertas Exteriores", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "finishes", labelEn: "Finishes", labelEs: "Acabados", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "gas_connection", labelEn: "Gas Connection", labelEs: "Conexion de Gas", bucket: "exterior_add_ons", legacyTradeKey: "plumbing" },
  { key: "interior_build", labelEn: "Interior Build", labelEs: "Construccion Interior", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "interior_staircase", labelEn: "Interior Staircase", labelEs: "Escalera Interior", bucket: "product_containers", legacyTradeKey: "lumber" },
  { key: "kitchen", labelEn: "Kitchen", labelEs: "Cocina", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "painting", labelEn: "Painting", labelEs: "Pintura", bucket: "product_containers", legacyTradeKey: "finishes" },
  { key: "pergola", labelEn: "Pergola", labelEs: "Pergola", bucket: "exterior_add_ons", legacyTradeKey: "lumber" },
  { key: "plumbing", labelEn: "Plumbing", labelEs: "Plomeria", bucket: "product_containers", legacyTradeKey: "plumbing" },
  { key: "structural_prep", labelEn: "Structural Prep", labelEs: "Preparacion Estructural", bucket: "product_containers", legacyTradeKey: "steel" },
] as const;

export interface MasterMaterialLine {
  /** Stable cross-row id derived from category+index (no Date.now()). */
  id: string;
  category: MasterMaterialCategoryKey;
  description: string;
  /** Canonical qty for ONE container. `qtyTotal` = `qtyPerContainer * project.containerCount` (P1.3). */
  qtyPerContainer: number;
  /** Base material cost in USD per unit (pre-IVU, pre-contingency). */
  materialCost: number;
  /** Puerto Rico sales tax. Default 11.5% per the source xlsx. */
  ivuPercent: number;
  /** Per-line contingency reserve. Default 20% per the source xlsx. */
  contingencyPercent: number;
  /** Optional human note from the source xlsx (e.g. "For Metal Frames"). */
  comment?: string;
}

export const KONTI_MASTER_MATERIALS_2026: ReadonlyArray<MasterMaterialLine> = [
  { id: "mm-container_purchase-001", category: "container_purchase", description: "40 ft High Cube", qtyPerContainer: 1.0, materialCost: 5100.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-structural_prep-001", category: "structural_prep", description: "1 Gal. Oil-Red Oxide Metal Primer", qtyPerContainer: 10.0, materialCost: 29.98, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-structural_prep-002", category: "structural_prep", description: "9 in. x 1/2 in. Pro Surpass Shed-Resistant Knit High-Density Fabric Roller", qtyPerContainer: 2.0, materialCost: 12.97, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-structural_prep-003", category: "structural_prep", description: "10.1 oz. Super Nail", qtyPerContainer: 5.0, materialCost: 3.48, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "For Metal Frames" },
  { id: "mm-structural_prep-004", category: "structural_prep", description: "Aqua-Proof 1 Gal. Waterproofing Roof Primer", qtyPerContainer: 1.0, materialCost: 31.48, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "For Metal Frames & Wood Floors" },
  { id: "mm-cut_frames-001", category: "cut_frames", description: "Windows and Doors Cuts, and Installation of metal frames", qtyPerContainer: 1.0, materialCost: 4000.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference Susan Gonzalez" },
  { id: "mm-interior_build-001", category: "interior_build", description: "Prodex Ins 3MMM 4 x 125", qtyPerContainer: 2.0, materialCost: 342.48, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-002", category: "interior_build", description: "Track 20GA 3-5/8″", qtyPerContainer: 15.0, materialCost: 8.53, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Divisions" },
  { id: "mm-interior_build-003", category: "interior_build", description: "Track 20GA 2-1/2″", qtyPerContainer: 35.0, materialCost: 7.02, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-004", category: "interior_build", description: "Stud 20GA 2-1/2″X8′", qtyPerContainer: 30.0, materialCost: 5.89, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Ceiling" },
  { id: "mm-interior_build-005", category: "interior_build", description: "Stud 20GA 2-1/2″X10′", qtyPerContainer: 90.0, materialCost: 7.4, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Walls" },
  { id: "mm-interior_build-006", category: "interior_build", description: "Stud 20GA 3-5/8″X10′", qtyPerContainer: 30.0, materialCost: 8.99, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Divisions" },
  { id: "mm-interior_build-007", category: "interior_build", description: "2 in. x 4 in. x 8 ft. Pressure-Treated Board Southern Yellow Pine Lumber", qtyPerContainer: 10.0, materialCost: 6.38, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-008", category: "interior_build", description: "3/4 in. x 4 ft. x 8 ft. CC Pressure-Treated Pine Plywood", qtyPerContainer: 5.0, materialCost: 59.18, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Blocking" },
  { id: "mm-interior_build-009", category: "interior_build", description: "10.1 oz. Super Nail", qtyPerContainer: 5.0, materialCost: 3.48, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-010", category: "interior_build", description: "#7 7/16 in. Phillips Pan-Head Sheet Metal Screws (400-Pack)", qtyPerContainer: 1.0, materialCost: 12.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Metal Screws" },
  { id: "mm-interior_build-011", category: "interior_build", description: "100 ft. Bold Line Chalk Reel Kit with Red Chalk", qtyPerContainer: 1.0, materialCost: 16.97, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-012", category: "interior_build", description: "Tornillo Gypsum 6×1-1/4″ S", qtyPerContainer: 1.0, materialCost: 110.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Bugle Head" },
  { id: "mm-interior_build-013", category: "interior_build", description: "Drywall 4’x10’x5/8” FR/MT", qtyPerContainer: 50.0, materialCost: 33.25, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-014", category: "interior_build", description: "Drywall 4’x8’x5/8″ FR/MT", qtyPerContainer: 5.0, materialCost: 22.5, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-015", category: "interior_build", description: "FibaTape Standard White 1-7/8 in. x 500 ft. Self-Adhesive", qtyPerContainer: 3.0, materialCost: 13.42, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-016", category: "interior_build", description: "1-1/4 in. x 8 ft. Vinyl Drywall Corner Bead", qtyPerContainer: 50.0, materialCost: 2.6, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-017", category: "interior_build", description: "T50 1/4 in. Stainless-Steel Staples", qtyPerContainer: 5.0, materialCost: 14.97, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-018", category: "interior_build", description: "Joint Compound Ready Mix USG 4.5GAL", qtyPerContainer: 5.0, materialCost: 27.95, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "All purpose Dark-green" },
  { id: "mm-interior_build-019", category: "interior_build", description: "JOINT COMPOUND ULTRALIGHT USG 4.5 GAL.", qtyPerContainer: 1.0, materialCost: 25.95, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Ultra lightweight Light-green" },
  { id: "mm-interior_build-020", category: "interior_build", description: "120 Grit Drywall Sanding Sheets", qtyPerContainer: 5.0, materialCost: 11.93, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-021", category: "interior_build", description: "5 in. 120-Grit Universal Hole Random Orbital Sanding Disc", qtyPerContainer: 1.0, materialCost: 21.97, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_build-022", category: "interior_build", description: "1/2 in. x 4 ft. x 8 ft. White PVC Sheet Panel", qtyPerContainer: 2.0, materialCost: 46.95, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Baseboard" },
  { id: "mm-interior_build-023", category: "interior_build", description: "Waterproof Luxury Vinyl Plank Flooring", qtyPerContainer: 25.0, materialCost: 64.67, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "In cases; Various Color Option" },
  { id: "mm-exterior_windows_and_doors-001", category: "exterior_windows_and_doors", description: "Windows and Doors", qtyPerContainer: 1.0, materialCost: 2440.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference Susan Gonzalez" },
  { id: "mm-plumbing-001", category: "plumbing", description: "Plumbing Infrastructure Installation", qtyPerContainer: 1.0, materialCost: 2000.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference Susan Gonzalez" },
  { id: "mm-electrical-001", category: "electrical", description: "200 Amp 20-Space 40-Circuit Main Lug Indoor Load Center Contractor Kit", qtyPerContainer: 1.0, materialCost: 104.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-002", category: "electrical", description: "Homeline 20 Amp Single-Pole Circuit Breaker", qtyPerContainer: 7.0, materialCost: 7.54, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-003", category: "electrical", description: "BR 2-30 Amp 2 Pole BQ (Independent Trip) Quad Circuit Breaker", qtyPerContainer: 1.0, materialCost: 33.95, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-004", category: "electrical", description: "Homeline 50 Amp 2-Pole Circuit Breaker", qtyPerContainer: 2.0, materialCost: 18.34, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-005", category: "electrical", description: "Decora 1-Gang Midway Nylon Wall Plate - White", qtyPerContainer: 23.0, materialCost: 1.11, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-006", category: "electrical", description: "15 Amp Self-Test SmartlockPro Slim Tamper Resistant GFCI Duplex Outlet, White (3-Pack)", qtyPerContainer: 5.0, materialCost: 64.96, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-007", category: "electrical", description: "15 Amp Decora Type A and C USB Charger Tamper-Resistant Outlet, White", qtyPerContainer: 10.0, materialCost: 38.2, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-008", category: "electrical", description: "1-Gang 4 in. 30.3 cu. in. Metal Square Electrical Box", qtyPerContainer: 30.0, materialCost: 4.27, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-009", category: "electrical", description: "Decora 15 Amp 3-Way AC Quiet Rocker Switch, White", qtyPerContainer: 6.0, materialCost: 0.85, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-010", category: "electrical", description: "Decora 15 Amp 3-Way AC Combination Switch, White", qtyPerContainer: 2.0, materialCost: 18.64, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-011", category: "electrical", description: "Firex Smoke Detector, Hardwired with 9-Volt Battery Backup & Front Load Battery Door, Adapters Included, Smoke Alarm", qtyPerContainer: 1.0, materialCost: 24.47, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-012", category: "electrical", description: "3/4 in. x 100 ft. Alflex RWA Metallic Aluminum Flexible Conduit", qtyPerContainer: 1.0, materialCost: 114.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-013", category: "electrical", description: "100 ft. 12 Gauge White Stranded Copper THHN Wire", qtyPerContainer: 1.0, materialCost: 50.76, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-014", category: "electrical", description: "100 ft. 10 Gauge Red Stranded Copper THHN Wire", qtyPerContainer: 1.0, materialCost: 58.32, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-electrical-015", category: "electrical", description: "100 ft. 8 Gauge Green Stranded Copper THHN Wire", qtyPerContainer: 1.0, materialCost: 74.52, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-001", category: "painting", description: "5 gal. #52 White Eggshell Interior Paint", qtyPerContainer: 2.0, materialCost: 109.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-002", category: "painting", description: "5 Gal. White Acrylic Interior Drywall Plus Primer and Sealer", qtyPerContainer: 2.0, materialCost: 103.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-003", category: "painting", description: "Easy Mask 2.9 ft. x 140 ft. Builder's Paper", qtyPerContainer: 2.0, materialCost: 13.98, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-004", category: "painting", description: "ScotchBlue 1.88 in. x 60 yds.", qtyPerContainer: 1.0, materialCost: 39.48, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-005", category: "painting", description: "Urethanizer 5 Gal. 100% Acrylic Urethane Elastomeric White Reflective Roof Sealer", qtyPerContainer: 2.0, materialCost: 159.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-006", category: "painting", description: "12 in. Deep Well Plastic Paint Roller Tray", qtyPerContainer: 1.0, materialCost: 6.3, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-007", category: "painting", description: "14 in. x 1/2 in. High-Density Fabric Pro White Woven Roller", qtyPerContainer: 6.0, materialCost: 12.12, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-008", category: "painting", description: "3.5 qt. All Purpose Ready-Mixed Joint Compound", qtyPerContainer: 1.0, materialCost: 11.59, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-painting-009", category: "painting", description: "5 gal. White Semi-Gloss Direct-to-Metal Interior/Exterior Paint", qtyPerContainer: 2.0, materialCost: 207.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-consumables-001", category: "consumables", description: "Various", qtyPerContainer: 5.0, materialCost: 500.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Per Phase (Total Phases = 5)" },
  { id: "mm-bathroom-001", category: "bathroom", description: "Premier Accents White Carrara 12 in. x 12 in. Marble Hexagon Mosaic Tile", qtyPerContainer: 28.0, materialCost: 18.39, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference a M1 bathroom dimension" },
  { id: "mm-bathroom-002", category: "bathroom", description: "Multi-Purpose 10.1 fl. oz. White Siliconized Acrylic Latex Caulk", qtyPerContainer: 2.0, materialCost: 4.28, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-003", category: "bathroom", description: "White Hollywood 5 in. x 30 in. Polished Marble Floor", qtyPerContainer: 1.0, materialCost: 22.99, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-004", category: "bathroom", description: "Designline 4 in. x 4 in. Stainless Steel Square Shower Drain", qtyPerContainer: 1.0, materialCost: 54.25, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-005", category: "bathroom", description: "All Purpose Silicone 1 Caulk 10.1 oz Window and Door Sealant Clear", qtyPerContainer: 2.0, materialCost: 8.98, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-006", category: "bathroom", description: "Keracolor 10 lbs. Eggshell Unsanded Grout", qtyPerContainer: 2.0, materialCost: 8.7, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-007", category: "bathroom", description: "50 lb. Ultraflex 1 Tile Mortar with Polymer", qtyPerContainer: 2.0, materialCost: 16.4, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-008", category: "bathroom", description: "1/16 in. Hard Tile Spacers for Traditional or LeaveIn Installation", qtyPerContainer: 1.0, materialCost: 6.4, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-009", category: "bathroom", description: "1/2 in. x 4 ft. x 8 ft. Cement Board", qtyPerContainer: 5.0, materialCost: 58.58, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-bathroom-010", category: "bathroom", description: "Vigo Gris 12 in. x 24 in. Matte Ceramic Stone Look Floor and Wall Tile", qtyPerContainer: 15.0, materialCost: 16.02, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference a M1 bathroom dimension" },
  { id: "mm-bathroom-011", category: "bathroom", description: "Single Handle Shower Faucet 1.75 GPM in Spot Resist Brushed Nickel (Valve Included)", qtyPerContainer: 1.0, materialCost: 199.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-kitchen-001", category: "kitchen", description: "Professional Zero Radius 17 in. Drop-In Single Bowl", qtyPerContainer: 1.0, materialCost: 290.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-kitchen-002", category: "kitchen", description: "Gas Stove Top 24", qtyPerContainer: 1.0, materialCost: 159.99, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-kitchen-003", category: "kitchen", description: "Cabinets & Quartz Top", qtyPerContainer: 1.0, materialCost: 2500.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Using as reference Susan Gonzalez" },
  { id: "mm-finishes-001", category: "finishes", description: "7 in. White Round Closet Light LED Flush Mount Ceiling Light", qtyPerContainer: 4.0, materialCost: 24.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-002", category: "finishes", description: "52 in. Indoor Rhode Island Walnut Ceiling Fan", qtyPerContainer: 2.0, materialCost: 179.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-003", category: "finishes", description: "8 in. Black LED Outdoor Wall Lantern Sconce", qtyPerContainer: 4.0, materialCost: 64.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-004", category: "finishes", description: "18 BTU AC Inverter", qtyPerContainer: 1.0, materialCost: 564.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-005", category: "finishes", description: "36 in. x 84 in. No Panel Lincoln Park Primed Interior Sliding Barn Door Slab with Hardware Kit", qtyPerContainer: 0.0, materialCost: 299.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-006", category: "finishes", description: "Stainless Steel Adjustable C Guide", qtyPerContainer: 0.0, materialCost: 14.47, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-007", category: "finishes", description: "48 in. x 80 in. Aluminum White Mirror Sliding Door", qtyPerContainer: 0.0, materialCost: 214.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-008", category: "finishes", description: "30 in. x 80 in. 6 Panel Textured Hollow Core Primed Composite Interior Door Slab", qtyPerContainer: 3.0, materialCost: 63.86, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-009", category: "finishes", description: "Interior Door Jamb Moulding", qtyPerContainer: 3.0, materialCost: 43.88, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-010", category: "finishes", description: "3-1/2 in. x 1/4 in. Radius Satin Nickel Squeak-Free Door Hinge (3-Pack)", qtyPerContainer: 3.0, materialCost: 11.47, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-011", category: "finishes", description: "Square Satin Nickel Bed/Bath Door Handle", qtyPerContainer: 3.0, materialCost: 33.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-012", category: "finishes", description: "White Soft Dome Door Stop", qtyPerContainer: 3.0, materialCost: 5.27, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-finishes-013", category: "finishes", description: "Vanity", qtyPerContainer: 1.0, materialCost: 249.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-finishes-014", category: "finishes", description: "Faucet", qtyPerContainer: 1.0, materialCost: 89.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-finishes-015", category: "finishes", description: "Toilet", qtyPerContainer: 1.0, materialCost: 109.0, ivuPercent: 11.5, contingencyPercent: 20.0 },
  { id: "mm-interior_staircase-001", category: "interior_staircase", description: "One Story Wood Staircase", qtyPerContainer: 0.0, materialCost: 5000.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-exterior_steel_structure-001", category: "exterior_steel_structure", description: "Square feet", qtyPerContainer: 0.0, materialCost: 12.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-exterior_staircase-001", category: "exterior_staircase", description: "One Story Steel Staircase", qtyPerContainer: 0.0, materialCost: 7500.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-001", category: "decking", description: "2 in. x 6 in. x 8 ft. #2 Prime Pressure-Treated Lumber", qtyPerContainer: 0.0, materialCost: 10.58, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-002", category: "decking", description: "4Pack One-Stop Cable Railing Post Kit", qtyPerContainer: 0.0, materialCost: 339.99, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-003", category: "decking", description: "8 oz.. Pine Wood Filler", qtyPerContainer: 0.0, materialCost: 3.98, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-004", category: "decking", description: "5 in. 80-Grit Universal Hole Random Orbital Sanding Disc with Hook and Lock Backing (50-Pack)", qtyPerContainer: 0.0, materialCost: 21.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-005", category: "decking", description: "Waterproofing Exterior Wood Finish", qtyPerContainer: 0.0, materialCost: 50.58, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-decking-006", category: "decking", description: "10 x 1-7/16 in. Phillips Round Head Screw with Wings (300-Pack)", qtyPerContainer: 0.0, materialCost: 31.77, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-001", category: "pergola", description: "4 in. x 4 in. x 8 ft. #2 Ground Contact Pressure-Treated Southern Yellow Pine Timber", qtyPerContainer: 0.0, materialCost: 14.78, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-002", category: "pergola", description: "2 in. x 6 in. x 8 ft. #2 Prime Pressure-Treated Lumber", qtyPerContainer: 0.0, materialCost: 10.58, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-003", category: "pergola", description: "24PCS Concealed Joist Hangers, Concealed Flange Light Joist Hanger for Wood Rail, 2”x 4”", qtyPerContainer: 0.0, materialCost: 72.99, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-004", category: "pergola", description: "3 way 90 deg angle pergola kit", qtyPerContainer: 0.0, materialCost: 125.75, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-005", category: "pergola", description: "26 in. x 8 ft. Corrugated Polycarbonate Roof Panel in Clear", qtyPerContainer: 0.0, materialCost: 24.98, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-006", category: "pergola", description: "#9 x 1-1/2 in. External Hex Zinc Plated Steel Hex Washer Head Roofing Screws", qtyPerContainer: 0.0, materialCost: 14.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-pergola-007", category: "pergola", description: "2-7/8 inch flat head wood screws – Black (50 Pack)", qtyPerContainer: 0.0, materialCost: 24.97, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-appliances-001", category: "appliances", description: "10.1 cu. ft. Top Freezer Refrigerator in Stainless Steel", qtyPerContainer: 0.0, materialCost: 500.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-appliances-002", category: "appliances", description: "4.8 cu. ft. Smart White Front Load Washer with OdorBlock UltraFresh Vent System and Sanitize", qtyPerContainer: 0.0, materialCost: 1049.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-appliances-003", category: "appliances", description: "7.8 cu. ft. Smart Front Load Electric Dryer in White with Sanitize Cycle", qtyPerContainer: 0.0, materialCost: 1049.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-appliances-004", category: "appliances", description: "2.6 cu. ft. Mini Fridge in Black without Freezer", qtyPerContainer: 0.0, materialCost: 149.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-appliances-005", category: "appliances", description: "1.6 cu. ft. Over-the-Range Microwave in Stainless Steel", qtyPerContainer: 0.0, materialCost: 349.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
  { id: "mm-gas_connection-001", category: "gas_connection", description: "Gas tanks and other materials", qtyPerContainer: 0.0, materialCost: 350.0, ivuPercent: 11.5, contingencyPercent: 20.0, comment: "Data Entry according the design details" },
] as const;

/** Count of master rows - sanity-check value for migration tests. */
export const MASTER_MATERIALS_ROW_COUNT = 107;

/** Lookup the category meta by key. Returns undefined for unknown keys. */
export function masterCategoryMeta(key: string): MasterMaterialCategoryMeta | undefined {
  return MASTER_MATERIAL_CATEGORIES.find((c) => c.key === key);
}
