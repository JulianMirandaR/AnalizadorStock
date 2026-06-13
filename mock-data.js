const INITIAL_MOCK_PRODUCTS = [
  // Santiago Marzo
  { id: "sm-001", sku: "1001", descripcion: "185/65R15 Firemax FM316", stock: 12, sector: "Estantería A-1", sucursal: "Santiago Marzo" },
  { id: "sm-002", sku: "1002", descripcion: "195/55R16 Triangle AdvanteX", stock: 8, sector: "Estantería A-2", sucursal: "Santiago Marzo" },
  { id: "sm-003", sku: "1003", descripcion: "205/55R16 Bridgestone Turanza ER300", stock: 15, sector: "Estantería B-1", sucursal: "Santiago Marzo" },
  { id: "sm-004", sku: "1004", descripcion: "225/45R17 Michelin Pilot Sport 4", stock: 6, sector: "Estantería B-2", sucursal: "Santiago Marzo" },
  { id: "sm-005", sku: "1005", descripcion: "175/70R14 Pirelli Chrono", stock: 24, sector: "Pasillo 1 - Sector A", sucursal: "Santiago Marzo" },
  { id: "sm-006", sku: "1006", descripcion: "205/60R15 Goodyear Assurance", stock: 18, sector: "Pasillo 1 - Sector B", sucursal: "Santiago Marzo" },
  { id: "sm-007", sku: "1007", descripcion: "265/70R16 Dunlop Grandtrek AT3", stock: 4, sector: "Piso Industrial", sucursal: "Santiago Marzo" },
  { id: "sm-008", sku: "1008", descripcion: "215/65R16 Yokohama Bluearth", stock: 10, sector: "Estantería C-1", sucursal: "Santiago Marzo" },
  { id: "sm-009", sku: "1009", descripcion: "195/65R15 Hankook Kinergy Eco2", stock: 20, sector: "Estantería C-2", sucursal: "Santiago Marzo" },
  { id: "sm-010", sku: "1010", descripcion: "205/55R16 Kumho Ecowing ES31", stock: 14, sector: "Estantería C-3", sucursal: "Santiago Marzo" },
  { id: "sm-011", sku: "1011", descripcion: "175/65R14 Firemax FM316", stock: 32, sector: "Pasillo 2 - Sector A", sucursal: "Santiago Marzo" },
  { id: "sm-012", sku: "1012", descripcion: "185/60R15 Triangle Sportex", stock: 11, sector: "Pasillo 2 - Sector B", sucursal: "Santiago Marzo" },
  { id: "sm-013", sku: "1013", descripcion: "225/65R17 Bridgestone Dueler H/P Sport", stock: 8, sector: "Piso Industrial", sucursal: "Santiago Marzo" },
  { id: "sm-014", sku: "1014", descripcion: "205/45R17 Michelin Primacy 4", stock: 5, sector: "Estantería D-1", sucursal: "Santiago Marzo" },
  { id: "sm-015", sku: "1015", descripcion: "165/70R13 Pirelli Formula Energy", stock: 40, sector: "Pasillo 3 - Sector A", sucursal: "Santiago Marzo" },
  
  // Coronel Gil
  { id: "cg-001", sku: "1001", descripcion: "185/65R15 Firemax FM316", stock: 7, sector: "Estantería A-1", sucursal: "Coronel Gil" },
  { id: "cg-002", sku: "1002", descripcion: "195/55R16 Triangle AdvanteX", stock: 14, sector: "Estantería A-2", sucursal: "Coronel Gil" },
  { id: "cg-003", sku: "1003", descripcion: "205/55R16 Bridgestone Turanza ER300", stock: 9, sector: "Estantería A-3", sucursal: "Coronel Gil" },
  { id: "cg-004", sku: "1004", descripcion: "225/45R17 Michelin Pilot Sport 4", stock: 11, sector: "Estantería B-1", sucursal: "Coronel Gil" },
  { id: "cg-005", sku: "1005", descripcion: "175/70R14 Pirelli Chrono", stock: 15, sector: "Pasillo 1 - Sector A", sucursal: "Coronel Gil" },
  { id: "cg-006", sku: "1006", descripcion: "205/60R15 Goodyear Assurance", stock: 6, sector: "Pasillo 1 - Sector B", sucursal: "Coronel Gil" },
  { id: "cg-007", sku: "1007", descripcion: "265/70R16 Dunlop Grandtrek AT3", stock: 8, sector: "Piso Principal", sucursal: "Coronel Gil" },
  { id: "cg-008", sku: "1008", descripcion: "215/65R16 Yokohama Bluearth", stock: 12, sector: "Estantería B-2", sucursal: "Coronel Gil" },
  { id: "cg-009", sku: "1009", descripcion: "195/65R15 Hankook Kinergy Eco2", stock: 18, sector: "Estantería B-3", sucursal: "Coronel Gil" },
  { id: "cg-010", sku: "1016", descripcion: "195/60R15 Fate Sentiva AR-360", stock: 22, sector: "Estantería C-1", sucursal: "Coronel Gil" },
  { id: "cg-011", sku: "1017", descripcion: "205/65R15 Goodyear Eagle Sport", stock: 13, sector: "Estantería C-2", sucursal: "Coronel Gil" },
  { id: "cg-012", sku: "1018", descripcion: "185/65R14 Pirelli P400 Evo", stock: 35, sector: "Pasillo 2 - Sector A", sucursal: "Coronel Gil" },
  { id: "cg-013", sku: "1019", descripcion: "215/55R17 Michelin Primacy 3", stock: 4, sector: "Estantería D-1", sucursal: "Coronel Gil" },
  { id: "cg-014", sku: "1020", descripcion: "225/50R17 Bridgestone Potenza S001", stock: 8, sector: "Estantería D-2", sucursal: "Coronel Gil" },
  { id: "cg-015", sku: "1021", descripcion: "235/60R16 Dunlop SP Sport LM705", stock: 10, sector: "Piso Principal", sucursal: "Coronel Gil" },
  
  // Additional mixed stock to simulate a large list
  { id: "sm-016", sku: "1022", descripcion: "185/60R14 Fate Prestiva", stock: 25, sector: "Pasillo 3 - Sector B", sucursal: "Santiago Marzo" },
  { id: "sm-017", sku: "1023", descripcion: "215/45R17 Triangle Sportex TH201", stock: 12, sector: "Estantería D-2", sucursal: "Santiago Marzo" },
  { id: "sm-018", sku: "1024", descripcion: "235/75R15 Firemax FM518 (SUV)", stock: 6, sector: "Piso Industrial", sucursal: "Santiago Marzo" },
  { id: "sm-019", sku: "1025", descripcion: "195/50R15 Pirelli P7 Cinturato", stock: 14, sector: "Estantería D-3", sucursal: "Santiago Marzo" },
  { id: "sm-020", sku: "1026", descripcion: "215/60R17 Michelin LTX Force", stock: 8, sector: "Estantería E-1", sucursal: "Santiago Marzo" },
  { id: "cg-016", sku: "1022", descripcion: "185/60R14 Fate Prestiva", stock: 18, sector: "Pasillo 2 - Sector B", sucursal: "Coronel Gil" },
  { id: "cg-017", sku: "1023", descripcion: "215/45R17 Triangle Sportex TH201", stock: 15, sector: "Estantería D-3", sucursal: "Coronel Gil" },
  { id: "cg-018", sku: "1024", descripcion: "235/75R15 Firemax FM518 (SUV)", stock: 8, sector: "Piso Principal", sucursal: "Coronel Gil" },
  { id: "cg-019", sku: "1027", descripcion: "225/45R18 Goodyear Eagle F1", stock: 10, sector: "Estantería E-1", sucursal: "Coronel Gil" },
  { id: "cg-020", sku: "1028", descripcion: "245/40R19 Michelin Pilot Sport 5", stock: 4, sector: "Estantería E-2", sucursal: "Coronel Gil" }
];

// Add dynamic generation to reach more items easily if needed, but this 40 initial items list
// is highly clean and realistic for immediate rendering, and can be expanded in-app by the user.
// Let's generate another 60 items programmatically so we have exactly 100 items to test the high capacity.
(function generateMoreMockProducts() {
  const brands = ["Bridgestone", "Michelin", "Pirelli", "Goodyear", "Dunlop", "Yokohama", "Hankook", "Kumho", "Fate", "Firemax", "Triangle"];
  const dimensions = [
    "175/65R14", "185/60R15", "185/65R15", "195/50R15", "195/55R16", "195/65R15",
    "205/55R16", "205/60R15", "205/60R16", "215/55R16", "215/65R16", "225/45R17",
    "225/50R17", "225/60R17", "235/60R16", "245/45R18", "265/70R16"
  ];
  const lines = ["EcoTread", "SportMax", "Cinturato", "Formula-1", "Adventure AT", "Turanza XL", "Alenza", "Primacy", "Radial-700"];
  const sectors = ["Estantería A-3", "Estantería B-4", "Estantería C-4", "Estantería D-4", "Estantería F-1", "Estantería F-2", "Pasillo 4 - Sector A", "Pasillo 4 - Sector B", "Pasillo 5", "Piso Exterior"];
  const branches = ["Santiago Marzo", "Coronel Gil"];

  let baseSku = 1029;
  for (let i = 0; i < 60; i++) {
    const brand = brands[i % brands.length];
    const dim = dimensions[i % dimensions.length];
    const line = lines[i % lines.length];
    const sector = sectors[i % sectors.length];
    const branch = branches[i % branches.length];
    const stock = Math.floor(Math.random() * 30) + 1; // 1 to 30

    INITIAL_MOCK_PRODUCTS.push({
      id: `${branch === "Santiago Marzo" ? "sm" : "cg"}-gen-${i}`,
      sku: String(baseSku++),
      descripcion: `${dim} ${brand} ${line}`,
      stock: stock,
      sector: sector,
      sucursal: branch
    });
  }
})();

// Export for commonJS or simple script tag inclusion
if (typeof module !== "undefined" && module.exports) {
  module.exports = { INITIAL_MOCK_PRODUCTS };
}
