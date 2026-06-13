/**
 * NEUMÁTICOS STOCK - Lógica Principal de la Aplicación (SPA)
 */

// Estado global de la aplicación
const AppState = {
  products: [],
  movements: [],
  currentBranchFilter: "santiago", // "santiago" | "coronel" | "combinado"
  searchTerm: "",
  sortBy: "desc-az", // "desc-az" | "stock-desc" | "stock-asc"
  editingCell: null, // Mantiene tracking de la celda de texto en edición: { id, field }
  isAddingProduct: false,
  
  // Auditoría Gnik
  auditResults: null,
  currentAuditTab: "diff",
  auditSearchTerm: "",
  tempImportData: null,
  
  // Filtros del historial
  historyFilters: {
    sku: "",
    desc: "",
    branch: "",
    dateFrom: "",
    dateTo: "",
    day: ""
  },
  
  // Control de ordenamiento y color para cambios recientes
  sortingStocks: {}, // Mantiene stock congelado para ordenamiento: { id: stock }
  sortingTimers: {}, // Mantiene referencias a setTimeout: { id: timer }
  updatedProducts: new Set() // Set de IDs de productos modificados en esta sesión
};

// Inicialización cuando el DOM está listo
document.addEventListener("DOMContentLoaded", async () => {
  setupEventHandlers();
  
  // Mostrar cargando
  showLoadingState();

  // Inicializar base de datos dual (Firebase / Local)
  const isFirebaseActive = await StockDB.init(
    // Callback cuando cambian los productos
    (updatedProducts) => {
      AppState.products = updatedProducts;
      renderTable();
      updateNavbarStats();
    },
    // Callback cuando cambian los movimientos
    (updatedMovements) => {
      AppState.movements = updatedMovements;
      renderSidebarFeed();
      renderHistoryTable();
    }
  );

  updateConnectionStatusUI(isFirebaseActive);
});

/**
 * Muestra el estado de cargando en la tabla y panel
 */
function showLoadingState() {
  const tbody = document.getElementById("table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          <i class="fas fa-spinner fa-spin" style="font-size: 1.5rem; margin-bottom: 0.5rem; color: var(--accent-cyan);"></i>
          <p>Cargando catálogo de neumáticos...</p>
        </td>
      </tr>
    `;
  }
}

/**
 * Actualiza el indicador visual de conexión (Firebase vs Local)
 */
function updateConnectionStatusUI(isFirebaseActive) {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  
  if (isFirebaseActive) {
    dot.className = "status-dot online";
    text.textContent = "Servidor Conectado";
    text.style.color = "var(--accent-emerald)";
  } else {
    dot.className = "status-dot";
    text.textContent = "Servidor Desconectado";
    text.style.color = "var(--accent-rose)";
  }
}

/**
 * Carga las estadísticas rápidas de la barra superior
 */
function updateNavbarStats() {
  const totalTires = AppState.products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const totalModels = new Set(AppState.products.map(p => p.sku)).size;

  document.getElementById("stat-total-stock").textContent = totalTires.toLocaleString();
  document.getElementById("stat-total-models").textContent = totalModels.toLocaleString();
}

/**
 * CONFIGURACIÓN DE GESTORES DE EVENTOS (EVENT LISTENERS)
 */
function setupEventHandlers() {
  // Pestañas de sucursal
  const tabButtons = document.querySelectorAll(".branch-tabs .tab-btn");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      AppState.currentBranchFilter = btn.dataset.branch;
      
      // Ocultar botón de agregar neumático si estamos en modo combinado
      const btnAdd = document.getElementById("btn-add-product");
      const btnExportCurrent = document.getElementById("btn-export-current-branch");
      const btnExportAll = document.getElementById("btn-export-all-branches");
      
      if (AppState.currentBranchFilter === "combinado") {
        btnAdd.style.display = "none";
        // Si estaba abierto la fila de crear neumático, la cerramos
        cancelInlineNewProduct();
        
        // Mostrar botón completo y ocultar el individual
        if (btnExportCurrent) btnExportCurrent.style.display = "none";
        if (btnExportAll) btnExportAll.style.display = "inline-flex";
      } else {
        btnAdd.style.display = "flex";
        
        // Mostrar botón individual y ocultar el completo
        if (btnExportCurrent) btnExportCurrent.style.display = "inline-flex";
        if (btnExportAll) btnExportAll.style.display = "none";
      }

      renderTable();
    });
  });

  // Buscador instantáneo con Debounce
  const searchInput = document.getElementById("search-input");
  let searchDebounceTimer;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      AppState.searchTerm = e.target.value.toLowerCase().trim();
      renderTable();
    }, 150); // 150ms debounce para alta velocidad
  });

  // Asegurar que se desplace a la vista en móviles al enfocar (evitando que el teclado lo tape)
  searchInput.addEventListener("focus", () => {
    setTimeout(() => {
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300); // 300ms de retraso para dar tiempo a que el teclado virtual suba por completo
  });


  // Selector de Ordenamiento
  const sortBySelect = document.getElementById("sort-by-select");
  sortBySelect.addEventListener("change", (e) => {
    AppState.sortBy = e.target.value;
    renderTable();
  });

  // Botón para desplegar fila de añadir producto
  const btnAddProduct = document.getElementById("btn-add-product");
  btnAddProduct.addEventListener("click", () => {
    showInlineNewProductRow();
  });

  // Exportaciones de Excel
  document.getElementById("btn-export-current-branch").addEventListener("click", () => exportBranchExcel(true));
  document.getElementById("btn-export-all-branches").addEventListener("click", () => exportBranchExcel(false));
  document.getElementById("btn-export-history").addEventListener("click", exportHistoryExcel);

  // Botón para restablecer colores y ordenamiento diferido
  const btnResetColors = document.getElementById("btn-reset-updated-colors");
  if (btnResetColors) {
    btnResetColors.addEventListener("click", () => {
      // Limpiar temporizadores de ordenamiento activos
      Object.values(AppState.sortingTimers).forEach(timer => clearTimeout(timer));
      AppState.sortingTimers = {};
      AppState.sortingStocks = {};
      AppState.updatedProducts.clear();
      renderTable();
    });
  }

  // Filtros de historial de movimientos
  const hSku = document.getElementById("hist-filter-sku");
  const hDesc = document.getElementById("hist-filter-desc");
  const hBranch = document.getElementById("hist-filter-branch");
  const hDay = document.getElementById("hist-filter-day");
  const hFrom = document.getElementById("hist-filter-from");
  const hTo = document.getElementById("hist-filter-to");

  const triggerHistoryFilter = () => {
    AppState.historyFilters = {
      sku: hSku.value.toLowerCase().trim(),
      desc: hDesc.value.toLowerCase().trim(),
      branch: hBranch.value,
      day: hDay.value,
      dateFrom: hFrom.value,
      dateTo: hTo.value
    };
    renderHistoryTable();
  };

  hSku.addEventListener("input", triggerHistoryFilter);
  hDesc.addEventListener("input", triggerHistoryFilter);
  hBranch.addEventListener("change", triggerHistoryFilter);
  hDay.addEventListener("change", triggerHistoryFilter);
  hFrom.addEventListener("change", triggerHistoryFilter);
  hTo.addEventListener("change", triggerHistoryFilter);

  // Botón limpiar filtros de historial
  document.getElementById("btn-clear-history-filters").addEventListener("click", () => {
    hSku.value = "";
    hDesc.value = "";
    hBranch.value = "";
    hDay.value = "";
    hFrom.value = "";
    hTo.value = "";
    triggerHistoryFilter();
  });

  // --- EVENTO DE DESPLIEGUE Y AUTO-SCROLL DEL HISTORIAL ---
  const historyHeader = document.getElementById("history-header-trigger");
  const historySection = document.getElementById("history-section");
  
  historyHeader.addEventListener("click", (e) => {
    // Si el clic viene del botón de exportar Excel, no colapsar/expandir
    if (e.target.closest("#btn-export-history")) return;
    
    historySection.classList.toggle("collapsed");
    const isCollapsed = historySection.classList.contains("collapsed");
    
    if (!isCollapsed) {
      // Hacer scroll suave hacia abajo para mostrar el historial expandido en pantalla
      setTimeout(() => {
        historySection.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150); // Pequeño retraso para dejar que la animación de altura CSS inicie
    }
  });





  // --- EVENTOS DEL MODAL DE IMPORTACIÓN EXCEL ---
  const btnOpenImport = document.getElementById("btn-open-import");
  const importModal = document.getElementById("import-modal");
  const btnCloseImport = document.getElementById("btn-close-import");
  const btnCancelImport = document.getElementById("btn-cancel-import");
  const dropZone = document.getElementById("import-drop-zone");
  const fileInput = document.getElementById("import-file-input");
  const btnExecuteImport = document.getElementById("btn-execute-import");

  btnOpenImport.addEventListener("click", () => {
    // Resetear vistas del modal
    dropZone.style.display = "block";
    dropZone.innerHTML = `
      <i class="fas fa-cloud-upload-alt" style="font-size: 2.5rem; color: var(--accent-cyan); margin-bottom: 0.75rem;"></i>
      <p style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.25rem;">Arrastre aquí sus archivos Excel</p>
      <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">Soporta SantiagoMarzo.xlsx o CoronelGil.xlsx</p>
      <span class="btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: inline-block;">Seleccionar Archivo</span>
    `;
    document.getElementById("import-preview-section").style.display = "none";
    document.getElementById("import-results-section").style.display = "none";
    btnExecuteImport.disabled = true;
    btnExecuteImport.style.display = "inline-flex";
    btnExecuteImport.innerHTML = `<i class="fas fa-check"></i> Procesar Importación`;
    btnCancelImport.textContent = "Cerrar";
    fileInput.value = "";
    AppState.tempImportData = null;
    
    // Resetear checkbox de sobreescribir stock a desactivado por defecto
    const overwriteCheck = document.getElementById("import-overwrite-stock");
    if (overwriteCheck) {
      overwriteCheck.checked = false;
      overwriteCheck.dispatchEvent(new Event("change"));
    }
    
    importModal.style.display = "flex";
  });

  // Listener para toggle de sobrescribir stock
  const overwriteCheck = document.getElementById("import-overwrite-stock");
  const ruleWarning = document.getElementById("import-rule-warning");
  if (overwriteCheck && ruleWarning) {
    overwriteCheck.addEventListener("change", (e) => {
      if (e.target.checked) {
        ruleWarning.style.backgroundColor = "rgba(244, 63, 94, 0.1)";
        ruleWarning.style.borderLeftColor = "var(--accent-rose)";
        ruleWarning.style.color = "#fca5a5";
        ruleWarning.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right: 0.35rem;"></i>
          <strong>SOBREESCRITURA ACTIVA:</strong> Si el neumático ya existe en el catálogo, **se actualizará su stock** con el valor que figure en el Excel.`;
      } else {
        ruleWarning.style.backgroundColor = "rgba(245, 158, 11, 0.1)";
        ruleWarning.style.borderLeftColor = "var(--accent-amber)";
        ruleWarning.style.color = "#fcd34d";
        ruleWarning.innerHTML = `<i class="fas fa-exclamation-triangle" style="margin-right: 0.35rem;"></i>
          <strong>CONSERVACIÓN DE STOCK:</strong> Al importar, solo se cargarán los neumáticos nuevos (SKU nuevos). Si el neumático ya existe en el catálogo de esta sucursal, **su stock NO será modificado**.`;
      }
    });
  }

  const hideImportModal = () => {
    importModal.style.display = "none";
  };

  btnCloseImport.addEventListener("click", hideImportModal);
  btnCancelImport.addEventListener("click", hideImportModal);

  // Cerrar al hacer clic fuera
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) hideImportModal();
  });

  // Click en zona activa input
  dropZone.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleImportFile(file);
  });

  // Drag and Drop
  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--accent-cyan)";
      dropZone.style.backgroundColor = "rgba(6, 182, 212, 0.1)";
    }, false);
  });

  ["dragleave", "dragend", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--border-color)";
      dropZone.style.backgroundColor = "rgba(15, 23, 42, 0.4)";
    }, false);
  });

  dropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleImportFile(file);
  });

  btnExecuteImport.addEventListener("click", () => {
    executeExcelImport();
  });

  // --- EVENTO DE MÁSCARA Y DESPLIEGUE DEL LOG DE ACTIVIDAD EN VIVO ---
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
  const sidebar = document.getElementById("activity-sidebar");

  btnToggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    const isCollapsed = sidebar.classList.contains("collapsed");
    localStorage.setItem("sidebar_collapsed", isCollapsed ? "true" : "false");
  });

  // Cargar estado guardado de la barra lateral
  const savedSidebarState = localStorage.getItem("sidebar_collapsed");
  if (savedSidebarState === "true") {
    sidebar.classList.add("collapsed");
  }

  // --- EVENTOS DEL MODAL DE AUDITORÍA GNIK ---
  const btnOpenAudit = document.getElementById("btn-open-audit");
  const auditModal = document.getElementById("audit-modal");
  const btnCloseAudit = document.getElementById("btn-close-audit");
  const btnCancelAudit = document.getElementById("btn-cancel-audit");
  const auditDropZone = document.getElementById("audit-drop-zone");
  const auditFileInput = document.getElementById("audit-file-input");
  const btnExportAuditReport = document.getElementById("btn-export-audit-report");
  const auditSearchInput = document.getElementById("audit-search-input");

  btnOpenAudit.addEventListener("click", () => {
    // Determinar la sucursal de auditoría a partir de la pestaña activa
    let auditBranchName = "";
    let badgeClass = "badge-branch";
    if (AppState.currentBranchFilter === "santiago") {
      auditBranchName = "Santiago Marzo";
      badgeClass += " santiago";
    } else if (AppState.currentBranchFilter === "coronel") {
      auditBranchName = "Coronel Gil";
      badgeClass += " coronel";
    } else {
      auditBranchName = "Ambas Sucursales (Combinado)";
      badgeClass += " combinado";
    }

    // Actualizar badge en el header del modal
    const badgeEl = document.getElementById("audit-branch-badge");
    if (badgeEl) {
      badgeEl.textContent = auditBranchName === "Ambas Sucursales (Combinado)" ? "Combinado" : (auditBranchName === "Santiago Marzo" ? "S. Marzo" : "C. Gil");
      badgeEl.className = badgeClass;
    }

    // Resetear vistas del modal
    auditDropZone.style.display = "block";
    auditDropZone.innerHTML = `
      <i class="fas fa-file-excel" style="font-size: 2.5rem; color: var(--accent-emerald); margin-bottom: 0.75rem;"></i>
      <p style="font-size: 0.9rem; font-weight: 600; margin-bottom: 0.25rem;">Arrastre aquí el Excel de Gnik</p>
      <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem;">
        Se auditará la sucursal: <strong style="color: var(--accent-cyan);">${auditBranchName}</strong>
      </p>
      <p style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 0.75rem;">Se leerán SKUs (Col D), Descripciones (Col E) y Stock (Col G) desde fila 6</p>
      <span class="btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: inline-block; border-color: var(--accent-emerald); color: var(--accent-emerald);">Seleccionar Archivo Gnik</span>
    `;
    document.getElementById("audit-results-section").style.display = "none";
    auditFileInput.value = "";
    AppState.auditResults = null;
    AppState.currentAuditTab = "diff";
    AppState.auditSearchTerm = "";
    auditSearchInput.value = "";
    
    // Configurar tabs activas por defecto
    document.querySelectorAll(".audit-tab-btn").forEach(btn => {
      if (btn.dataset.tab === "diff") btn.classList.add("active");
      else btn.classList.remove("active");
    });
    document.querySelectorAll(".audit-stat-card").forEach(card => {
      if (card.id === "card-stat-diff") card.classList.add("active");
      else card.classList.remove("active");
    });

    auditModal.style.display = "flex";
  });

  const hideAuditModal = () => {
    auditModal.style.display = "none";
  };

  btnCloseAudit.addEventListener("click", hideAuditModal);
  btnCancelAudit.addEventListener("click", hideAuditModal);

  auditModal.addEventListener("click", (e) => {
    if (e.target === auditModal) hideAuditModal();
  });

  auditDropZone.addEventListener("click", () => {
    auditFileInput.click();
  });

  auditFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    handleGnikAuditFile(file);
  });

  // Drag and Drop
  ["dragenter", "dragover"].forEach(eventName => {
    auditDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      auditDropZone.style.borderColor = "var(--accent-emerald)";
      auditDropZone.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
    }, false);
  });

  ["dragleave", "dragend", "drop"].forEach(eventName => {
    auditDropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      auditDropZone.style.borderColor = "var(--border-color)";
      auditDropZone.style.backgroundColor = "rgba(15, 23, 42, 0.4)";
    }, false);
  });

  auditDropZone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    const file = dt.files[0];
    handleGnikAuditFile(file);
  });

  // Buscador de auditoría
  auditSearchInput.addEventListener("input", (e) => {
    AppState.auditSearchTerm = e.target.value.toLowerCase().trim();
    renderAuditTable();
  });

  // Exportación de auditoría
  btnExportAuditReport.addEventListener("click", () => {
    exportGnikAuditExcel();
  });

  // Click en tabs
  document.querySelectorAll(".audit-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".audit-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      AppState.currentAuditTab = btn.dataset.tab;
      
      // Sincronizar tarjeta de estadísticas activa
      document.querySelectorAll(".audit-stat-card").forEach(c => c.classList.remove("active"));
      const card = document.getElementById(`card-stat-${btn.dataset.tab}`);
      if (card) card.classList.add("active");

      renderAuditTable();
    });
  });

  // Click en tarjetas
  document.querySelectorAll(".audit-stat-card").forEach(card => {
    card.addEventListener("click", () => {
      const tabName = card.id.replace("card-stat-", "");
      document.querySelectorAll(".audit-tab-btn").forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add("active");
        else b.classList.remove("active");
      });
      document.querySelectorAll(".audit-stat-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      AppState.currentAuditTab = tabName;
      renderAuditTable();
    });
  });
}



/**
 * ALGORITMO MAP-REDUCE PARA COMBINAR STOCK DE SUCURSALES
 * Agrupa productos por SKU + Descripción (ignora mayúsculas/minúsculas y espacios extras)
 */
function getCombinedProducts(productsList) {
  const combinedMap = new Map();

  productsList.forEach(prod => {
    // Clave compuesta por SKU y descripción normalizada
    const normalizedSku = String(prod.sku).trim();
    const normalizedDesc = String(prod.descripcion).trim().toLowerCase();
    const key = `${normalizedSku}||${normalizedDesc}`;

    if (combinedMap.has(key)) {
      const existing = combinedMap.get(key);
      existing.stock += (prod.stock || 0);
      
      // Combinar sectores en una cadena única libre de duplicados
      if (prod.sector && prod.sector !== "General") {
        const sectorSet = new Set(existing.sectorsList);
        sectorSet.add(prod.sector);
        existing.sectorsList = Array.from(sectorSet);
        existing.sector = existing.sectorsList.join(" / ");
      }
    } else {
      combinedMap.set(key, {
        id: `comb-${prod.sku}`,
        sku: prod.sku,
        descripcion: prod.descripcion,
        stock: prod.stock || 0,
        sector: prod.sector || "General",
        sectorsList: prod.sector ? [prod.sector] : [],
        sucursal: "Ambas Sucursales",
        isCombined: true // Bandera para indicar que no es editable de forma directa
      });
    }
  });

  return Array.from(combinedMap.values());
}

/**
 * RENDEREA LA TABLA PRINCIPAL DE PRODUCTOS
 */
function renderTable() {
  const tbody = document.getElementById("table-body");
  if (!tbody) return;

  // 1. Filtrado inicial por Sucursal
  let filtered = [];
  if (AppState.currentBranchFilter === "santiago") {
    filtered = AppState.products.filter(p => p.sucursal === "Santiago Marzo");
  } else if (AppState.currentBranchFilter === "coronel") {
    filtered = AppState.products.filter(p => p.sucursal === "Coronel Gil");
  } else if (AppState.currentBranchFilter === "ambas") {
    filtered = [...AppState.products];
  } else if (AppState.currentBranchFilter === "combinado") {
    filtered = getCombinedProducts(AppState.products);
  }

  // Ordenar productos según criterio seleccionado
  if (AppState.sortBy === "desc-az") {
    filtered.sort((a, b) => String(a.descripcion).localeCompare(String(b.descripcion), undefined, {sensitivity: 'base'}));
  } else if (AppState.sortBy === "stock-desc") {
    filtered.sort((a, b) => {
      const stockA = AppState.sortingStocks[a.id] !== undefined ? AppState.sortingStocks[a.id] : (a.stock || 0);
      const stockB = AppState.sortingStocks[b.id] !== undefined ? AppState.sortingStocks[b.id] : (b.stock || 0);
      return stockB - stockA;
    });
  } else if (AppState.sortBy === "stock-asc") {
    filtered.sort((a, b) => {
      const stockA = AppState.sortingStocks[a.id] !== undefined ? AppState.sortingStocks[a.id] : (a.stock || 0);
      const stockB = AppState.sortingStocks[b.id] !== undefined ? AppState.sortingStocks[b.id] : (b.stock || 0);
      return stockA - stockB;
    });
  }

  // 2. Filtrado por Buscador Instantáneo
  if (AppState.searchTerm) {
    const term = AppState.searchTerm;
    filtered = filtered.filter(p => 
      String(p.sku).toLowerCase().includes(term) ||
      String(p.descripcion).toLowerCase().includes(term) ||
      String(p.sector).toLowerCase().includes(term)
    );
  }

  // Si está activo la fila de creación en curso, la guardamos para renderizar al principio
  let inlineAddHtml = "";
  if (AppState.isAddingProduct && AppState.currentBranchFilter !== "combinado") {
    const prefilledBranch = AppState.currentBranchFilter === "santiago" ? "Santiago Marzo" : 
                            (AppState.currentBranchFilter === "coronel" ? "Coronel Gil" : "Santiago Marzo");
                            
    inlineAddHtml = `
      <tr class="add-product-row" id="row-new-product">
        <td>
          <input type="text" id="new-sku" placeholder="Ej. 12345" autofocus required>
        </td>
        <td>
          <input type="text" id="new-desc" placeholder="Ej. 185/65R15 Firemax" required>
        </td>
        <td>
          <input type="text" id="new-sector" placeholder="Ej. Sector A, Estante..." required>
          <input type="hidden" id="new-branch" value="${prefilledBranch}">
        </td>
        <td style="display:flex; align-items:center; gap:0.5rem; border-bottom:1px solid var(--border-grid);">
          <input type="number" id="new-stock" placeholder="Stock" min="0" value="0" style="width: 60px; text-align: center;">
          <button class="btn-primary" onclick="saveInlineNewProduct()" style="padding: 0.3rem 0.6rem;" title="Guardar"><i class="fas fa-check"></i></button>
          <button class="btn-secondary" onclick="cancelInlineNewProduct()" style="padding: 0.3rem 0.6rem; border-color:var(--accent-rose); color:var(--accent-rose);" title="Cancelar"><i class="fas fa-times"></i></button>
        </td>
      </tr>
    `;
  }

  // 3. Renderizar las filas
  if (filtered.length === 0 && !AppState.isAddingProduct) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          No se encontraron neumáticos en el catálogo que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  let htmlRows = inlineAddHtml;
  filtered.forEach(p => {
    // Verificamos si esta fila está actualmente editando una celda de texto
    const editingSku = AppState.editingCell?.id === p.id && AppState.editingCell?.field === "sku";
    const editingDesc = AppState.editingCell?.id === p.id && AppState.editingCell?.field === "descripcion";
    const editingSector = AppState.editingCell?.id === p.id && AppState.editingCell?.field === "sector";

    const isUpdated = AppState.updatedProducts.has(p.id);
    const rowClass = isUpdated ? "row-updated" : "";
    htmlRows += `
      <tr id="tr-prod-${p.id}" class="${rowClass}">
        <!-- SKU -->
        <td class="${p.isCombined ? '' : 'editable-cell'}" data-id="${p.id}" data-field="sku">
          ${editingSku ? 
            `<input type="text" class="table-edit-input" value="${p.sku}" onblur="saveCellInline('${p.id}', 'sku', this.value)" onkeydown="handleCellKey(event, '${p.id}', 'sku', this)">` : 
            `<strong>${p.sku}</strong>`
          }
        </td>

        <!-- DESCRIPCIÓN -->
        <td class="${p.isCombined ? '' : 'editable-cell'}" data-id="${p.id}" data-field="descripcion">
          ${editingDesc ? 
            `<input type="text" class="table-edit-input" value="${p.descripcion}" onblur="saveCellInline('${p.id}', 'descripcion', this.value)" onkeydown="handleCellKey(event, '${p.id}', 'descripcion', this)">` : 
            p.descripcion
          }
        </td>

        <!-- SECTOR -->
        <td class="${p.isCombined ? '' : 'editable-cell'}" data-id="${p.id}" data-field="sector">
          ${editingSector ? 
            `<input type="text" class="table-edit-input" value="${p.sector === 'Importado Excel' ? '' : p.sector}" onblur="saveCellInline('${p.id}', 'sector', this.value)" onkeydown="handleCellKey(event, '${p.id}', 'sector', this)">` : 
            ((p.sector && p.sector !== "General" && p.sector !== "Importado Excel") ? `<span class="badge-sector">${p.sector}</span>` : '')
          }
        </td>

        <!-- STOCK CON BOTONES DE ACCIÓN RÁPIDA -->
        <td id="td-stock-${p.id}" style="position: relative;">
          ${p.isCombined ? `
            <div class="stock-control" title="Edición deshabilitada en modo combinado. Seleccione una sucursal para editar.">
              <button class="btn-stock-adjust minus" disabled style="opacity:0.3; cursor:not-allowed;"><i class="fas fa-minus"></i></button>
              <input type="text" class="stock-display-val" value="${p.stock}" disabled style="color:var(--accent-cyan); cursor:not-allowed;">
              <button class="btn-stock-adjust plus" disabled style="opacity:0.3; cursor:not-allowed;"><i class="fas fa-plus"></i></button>
            </div>
          ` : `
            <div class="stock-control">
              <button class="btn-stock-adjust minus" onclick="adjustStockInline('${p.id}', -1)" title="-1 Neumático"><i class="fas fa-minus"></i></button>
              <input type="number" 
                     class="stock-display-val" 
                     id="input-stock-${p.id}"
                     value="${p.stock}" 
                     min="0"
                     onfocus="this.dataset.old = this.value"
                     onblur="saveDirectStockVal('${p.id}', this)"
                     onkeydown="if(event.key === 'Enter') this.blur();">
              <button class="btn-stock-adjust plus" onclick="adjustStockInline('${p.id}', 1)" title="+1 Neumático"><i class="fas fa-plus"></i></button>
              
              <button class="btn-delete-row" onclick="deleteProductInline('${p.id}', '${p.sku}')" style="margin-left:auto; padding:0 0.5rem;" title="Eliminar Neumático"><i class="far fa-trash-alt"></i></button>
            </div>
          `}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = htmlRows;

  // Registrar listeners de doble-clic para celdas editables estilo planilla
  if (AppState.currentBranchFilter !== "combinado") {
    const cells = tbody.querySelectorAll(".editable-cell");
    cells.forEach(cell => {
      cell.addEventListener("dblclick", () => {
        const id = cell.dataset.id;
        const field = cell.dataset.field;
        
        // Evitar doble gatillo si ya se está editando esa celda
        if (AppState.editingCell?.id === id && AppState.editingCell?.field === field) return;
        
        AppState.editingCell = { id, field };
        renderTable(); // Re-renderizará mostrando el input en esa celda
        
        // Enfocar input interno inmediatamente
        setTimeout(() => {
          const input = cell.querySelector("input");
          if (input) {
            input.focus();
            input.select();
          }
        }, 10);
      });
    });
  }

  // Mostrar u ocultar botón de restablecer colores según haya productos modificados
  const btnResetColors = document.getElementById("btn-reset-updated-colors");
  if (btnResetColors) {
    if (AppState.updatedProducts.size > 0) {
      btnResetColors.style.display = "inline-flex";
    } else {
      btnResetColors.style.display = "none";
    }
  }
}

/**
 * MUESTRA LA FILA EN LÍNEA PARA REGISTRAR UN NUEVO PRODUCTO DIRECTAMENTE EN LA TABLA
 */
function showInlineNewProductRow() {
  AppState.isAddingProduct = true;
  renderTable();
  
  // Scrollear y enfocar la primera caja de texto
  const newSkuInput = document.getElementById("new-sku");
  if (newSkuInput) {
    newSkuInput.focus();
  }
}

function cancelInlineNewProduct() {
  AppState.isAddingProduct = false;
  renderTable();
}

/**
 * GUARDA UN NUEVO PRODUCTO INGRESADO DIRECTAMENTE EN LA TABLA
 */
async function saveInlineNewProduct() {
  const sku = document.getElementById("new-sku").value.trim();
  const desc = document.getElementById("new-desc").value.trim();
  const sector = document.getElementById("new-sector").value.trim();
  
  // Sucursal puede ser select o campo oculto según vista
  const branchEl = document.getElementById("new-branch");
  const branch = branchEl.value;

  const stock = parseInt(document.getElementById("new-stock").value) || 0;

  if (!sku || !desc || !sector) {
    alert("Por favor, rellene todos los campos (SKU, Descripción y Sector) para registrar el neumático.");
    return;
  }

  try {
    const newId = await StockDB.addProduct({
      sku,
      descripcion: desc,
      sector,
      sucursal: branch,
      stock
    });
    
    console.log("Producto agregado con ID:", newId);
    AppState.isAddingProduct = false;
    renderTable();
  } catch (error) {
    alert("Ocurrió un error al guardar el neumático. Por favor, intente de nuevo.");
  }
}

/**
 * ELIMINA UN PRODUCTO DESDE LA TABLA
 */
async function deleteProductInline(id, sku) {
  if (confirm(`¿Está seguro de que desea eliminar permanentemente del catálogo el neumático SKU: ${sku}?`)) {
    try {
      await StockDB.deleteProduct(id);
    } catch (err) {
      alert("Error al intentar eliminar el producto.");
    }
  }
}

/**
 * MANEJA LAS TECLAS DENTRO DE LOS INPUTS DE EDICIÓN EN LÍNEA DE CELDAS DE TEXTO
 */
function handleCellKey(event, id, field, inputElement) {
  if (event.key === "Enter") {
    // Al perder el foco (blur) se dispara la lógica de guardado
    inputElement.blur();
  } else if (event.key === "Escape") {
    // Cancelar edición
    AppState.editingCell = null;
    renderTable();
  }
}

/**
 * GUARDA EN LÍNEA UN CAMBIO EN UNA CELDA DE TEXTO (SKU, DESCRIPCIÓN O SECTOR)
 */
async function saveCellInline(id, field, newValue) {
  AppState.editingCell = null; // Quitar estado edición
  newValue = newValue.trim();

  // Buscar valor anterior para verificar si cambió realmente
  const product = AppState.products.find(p => p.id === id);
  if (!product || product[field] === newValue) {
    renderTable(); // Re-render normal sin guardar para restaurar vista
    return; 
  }

  if (newValue === "") {
    if (field === "sector") {
      newValue = "General";
    } else {
      alert("El campo no puede estar vacío.");
      renderTable();
      return;
    }
  }

  try {
    const updatedFields = {};
    updatedFields[field] = newValue;
    
    await StockDB.updateProductFields(id, updatedFields);
    console.log(`Guardado exitoso del campo ${field} de neumático ID: ${id}`);
  } catch (error) {
    alert("No se pudo actualizar el campo de forma directa en el servidor.");
    renderTable();
  }
}

/**
 * AJUSTA EL STOCK EN +-1 CON BOTONES DE ACCIÓN RÁPIDA (CON ANIMACIÓN DE PARPADEO)
 */
async function adjustStockInline(id, changeAmount) {
  const inputStock = document.getElementById(`input-stock-${id}`);
  const tdStock = document.getElementById(`td-stock-${id}`);
  
  if (!inputStock) return;

  const currentVal = parseInt(inputStock.value) || 0;
  const newVal = Math.max(0, currentVal + changeAmount);

  // Evitar cambios si ya es 0 y decrementa
  if (currentVal === 0 && changeAmount < 0) return;

  // Congelar el stock actual para mantener el orden por 30 segundos
  if (AppState.sortingStocks[id] === undefined) {
    AppState.sortingStocks[id] = currentVal;
  }

  // Configurar o refrescar el temporizador de 30 segundos
  if (AppState.sortingTimers[id]) {
    clearTimeout(AppState.sortingTimers[id]);
  }
  AppState.sortingTimers[id] = setTimeout(() => {
    delete AppState.sortingStocks[id];
    delete AppState.sortingTimers[id];
    renderTable();
  }, 30000);

  // Marcar como producto actualizado
  AppState.updatedProducts.add(id);

  // Actualizar input visual inmediatamente en pantalla para velocidad de carga instantánea
  inputStock.value = newVal;

  // Disparar flash animado
  const flashClass = changeAmount > 0 ? "flash-up" : "flash-down";
  tdStock.classList.remove("flash-up", "flash-down");
  void tdStock.offsetWidth; // Forzar reflow del DOM
  tdStock.classList.add(flashClass);

  try {
    // Enviar a la base de datos (se encargará de loguear el movimiento y actualizar estado reactivo)
    await StockDB.updateStock(id, changeAmount);
  } catch (error) {
    // Si falla, revertir input visual
    inputStock.value = currentVal;
    tdStock.classList.remove("flash-up", "flash-down");
    alert("Error al actualizar stock en la base de datos.");

    // Limpiar estados locales temporales en caso de fallo
    if (AppState.sortingTimers[id]) {
      clearTimeout(AppState.sortingTimers[id]);
      delete AppState.sortingTimers[id];
    }
    delete AppState.sortingStocks[id];
    AppState.updatedProducts.delete(id);
    renderTable();
  }
}

/**
 * GUARDA UN VALOR DE STOCK ESCRITO DIRECTAMENTE EN LA CAJA DE TEXTO NUMÉRICA
 */
async function saveDirectStockVal(id, inputElement) {
  const previousVal = parseInt(inputElement.dataset.old) || 0;
  const newVal = Math.max(0, parseInt(inputElement.value) || 0);
  
  // Si no hay cambio, no hacemos nada
  if (previousVal === newVal) {
    inputElement.value = previousVal;
    return;
  }

  const changeAmount = newVal - previousVal;
  const tdStock = document.getElementById(`td-stock-${id}`);

  // Congelar el stock previo para mantener el orden por 30 segundos
  if (AppState.sortingStocks[id] === undefined) {
    AppState.sortingStocks[id] = previousVal;
  }

  // Configurar o refrescar el temporizador de 30 segundos
  if (AppState.sortingTimers[id]) {
    clearTimeout(AppState.sortingTimers[id]);
  }
  AppState.sortingTimers[id] = setTimeout(() => {
    delete AppState.sortingStocks[id];
    delete AppState.sortingTimers[id];
    renderTable();
  }, 30000);

  // Marcar como producto actualizado
  AppState.updatedProducts.add(id);

  // Disparar flash animado
  const flashClass = changeAmount > 0 ? "flash-up" : "flash-down";
  if (tdStock) {
    tdStock.classList.remove("flash-up", "flash-down");
    void tdStock.offsetWidth; // Reflow
    tdStock.classList.add(flashClass);
  }

  try {
    await StockDB.updateStock(id, changeAmount);
  } catch (error) {
    inputElement.value = previousVal;
    if (tdStock) tdStock.classList.remove("flash-up", "flash-down");
    alert("Error al actualizar el stock ingresado.");

    // Limpiar estados locales temporales en caso de fallo
    if (AppState.sortingTimers[id]) {
      clearTimeout(AppState.sortingTimers[id]);
      delete AppState.sortingTimers[id];
    }
    delete AppState.sortingStocks[id];
    AppState.updatedProducts.delete(id);
    renderTable();
  }
}

/**
 * RENDEREA EL PANEL LATERAL DE ACTIVIDAD EN VIVO (DERECHA)
 * Formato requerido: [Producto] [Cambio (+ o -)] [Hora] [Fecha] [Sucursal]
 */
function renderSidebarFeed() {
  const feedContainer = document.getElementById("activity-feed");
  if (!feedContainer) return;

  if (AppState.movements.length === 0) {
    feedContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 2rem 0;">
        Aún no hay movimientos registrados hoy.
      </div>
    `;
    return;
  }

  // Tomar solo los últimos 30 movimientos rápidos para rendimiento y visualización
  const latestMovements = AppState.movements.slice(0, 30);

  let feedHtml = "";
  latestMovements.forEach(mov => {
    const isPositive = mov.cambio > 0;
    const sign = isPositive ? `+${mov.cambio}` : `${mov.cambio}`;
    const feedItemClass = isPositive ? "feed-item positive" : "feed-item negative";
    const badgeClass = isPositive ? "change-badge positive" : "change-badge negative";
    
    // Formato exacto requerido:
    // 185/65R15 Firemax -1 17:55:30 26-05-2026
    feedHtml += `
      <div class="${feedItemClass}">
        <div class="feed-header">
          <span class="feed-title">${mov.descripcion}</span>
          <span class="${badgeClass}">${sign}</span>
        </div>
        <div class="feed-meta">
          <span class="feed-branch">${mov.sucursal === "Santiago Marzo" ? "S.Marzo" : mov.sucursal}</span>
          <span class="feed-time">${mov.hora} &nbsp; ${mov.fecha}</span>
        </div>
      </div>
    `;
  });

  feedContainer.innerHTML = feedHtml;
}

/**
 * RENDEREA LA TABLA DE HISTORIAL DE MOVIMIENTOS CON SUS FILTROS AVANZADOS
 */
function renderHistoryTable() {
  const tbody = document.getElementById("history-table-body");
  if (!tbody) return;

  let filtered = [...AppState.movements];

  // Aplicar filtros avanzados de historial en memoria para velocidad insuperable
  const filters = AppState.historyFilters;

  // SKU
  if (filters.sku) {
    filtered = filtered.filter(m => String(m.sku).toLowerCase().includes(filters.sku));
  }
  // Descripción
  if (filters.desc) {
    filtered = filtered.filter(m => String(m.descripcion).toLowerCase().includes(filters.desc));
  }
  // Sucursal
  if (filters.branch) {
    filtered = filtered.filter(m => m.sucursal === filters.branch);
  }
  // Día exacto
  if (filters.day) {
    // Convertir input tipo "YYYY-MM-DD" a formato log "DD-MM-YYYY"
    const [y, m, d] = filters.day.split("-");
    const formattedDay = `${d}-${m}-${y}`;
    filtered = filtered.filter(m => m.fecha === formattedDay);
  }
  // Rango desde
  if (filters.dateFrom) {
    const fromTs = new Date(filters.dateFrom + "T00:00:00").getTime();
    filtered = filtered.filter(m => m.timestamp >= fromTs);
  }
  // Rango hasta
  if (filters.dateTo) {
    const toTs = new Date(filters.dateTo + "T23:59:59").getTime();
    filtered = filtered.filter(m => m.timestamp <= toTs);
  }

  // Renderizar filas de historial
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
          No hay registros de movimientos en el historial que coincidan con los filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  filtered.forEach(m => {
    const sign = m.cambio > 0 ? `+${m.cambio}` : `${m.cambio}`;
    const signColor = m.cambio > 0 ? "var(--accent-emerald)" : "var(--accent-rose)";
    
    html += `
      <tr>
        <td><strong>${m.sku}</strong></td>
        <td>${m.descripcion}</td>
        <td><span class="badge-branch ${m.sucursal.startsWith("Sant") ? 'santiago' : 'coronel'}">${m.sucursal === "Santiago Marzo" ? "S.Marzo" : m.sucursal}</span></td>
        <td style="color: ${signColor}; font-weight: 700;">${sign}</td>
        <td style="color: var(--text-muted);">${m.stockAnterior}</td>
        <td><strong>${m.stockNuevo}</strong></td>
        <td style="font-family: monospace;">${m.hora}</td>
        <td>${m.fecha}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

/**
 * EXPORTACIÓN A EXCEL USANDO SHEETJS (NATIVO EN NAVEGADOR)
 */
function exportBranchExcel(onlyCurrentBranch = true) {
  // Verificar si la librería está cargada
  if (typeof XLSX === "undefined") {
    alert("La librería de exportación de Excel aún se está cargando. Espere un momento e intente de nuevo.");
    return;
  }

  let dataToExport = [];
  let fileName = "";

  if (onlyCurrentBranch) {
    // Exportar una sucursal única
    let branchName = "";
    if (AppState.currentBranchFilter === "santiago") {
      dataToExport = AppState.products.filter(p => p.sucursal === "Santiago Marzo");
      branchName = "Santiago Marzo";
    } else if (AppState.currentBranchFilter === "coronel") {
      dataToExport = AppState.products.filter(p => p.sucursal === "Coronel Gil");
      branchName = "Coronel Gil";
    } else if (AppState.currentBranchFilter === "combinado") {
      dataToExport = getCombinedProducts(AppState.products);
      branchName = "Stock Combinado";
    } else {
      // Ambas sucursales juntas pero seleccionó "De una sucursal", exportamos por default la que sea
      alert("Por favor, seleccione la pestaña 'Santiago Marzo' o 'Coronel Gil' para descargar el Excel de esa sucursal en específico.");
      return;
    }
    fileName = `Stock_${branchName.replace(/ /g, "_")}.xlsx`;
  } else {
    // Exportar ambas sucursales juntas
    dataToExport = [...AppState.products];
    fileName = "Stock_Ambas_Sucursales_Completo.xlsx";
  }

  if (dataToExport.length === 0) {
    alert("No hay registros cargados para exportar.");
    return;
  }

  // Estructurar filas para Excel
  const rows = dataToExport.map(p => ({
    "SKU": p.sku,
    "Descripción": p.descripcion,
    "Stock": p.stock || 0,
    "Sector": p.sector || "General",
    "Sucursal": p.sucursal
  }));

  // Crear Libro de Trabajo (Workbook)
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Neumáticos");

  // Ajustar anchos de columnas automáticamente
  const maxProps = [{wch: 12}, {wch: 35}, {wch: 10}, {wch: 18}, {wch: 20}];
  worksheet['!cols'] = maxProps;

  // Descargar archivo nativo
  XLSX.writeFile(workbook, fileName);
}

/**
 * EXPORTA EL HISTORIAL DE MOVIMIENTOS A EXCEL FILTRADO SEGÚN PARÁMETROS EN PANTALLA
 */
function exportHistoryExcel() {
  if (typeof XLSX === "undefined") {
    alert("La librería de exportación de Excel aún está cargando.");
    return;
  }

  // Filtrar movimientos según filtros actuales en pantalla
  let filtered = [...AppState.movements];
  const filters = AppState.historyFilters;

  if (filters.sku) filtered = filtered.filter(m => String(m.sku).toLowerCase().includes(filters.sku));
  if (filters.desc) filtered = filtered.filter(m => String(m.descripcion).toLowerCase().includes(filters.desc));
  if (filters.branch) filtered = filtered.filter(m => m.sucursal === filters.branch);
  if (filters.day) {
    const [y, m, d] = filters.day.split("-");
    const formattedDay = `${d}-${m}-${y}`;
    filtered = filtered.filter(m => m.fecha === formattedDay);
  }
  if (filters.dateFrom) {
    const fromTs = new Date(filters.dateFrom + "T00:00:00").getTime();
    filtered = filtered.filter(m => m.timestamp >= fromTs);
  }
  if (filters.dateTo) {
    const toTs = new Date(filters.dateTo + "T23:59:59").getTime();
    filtered = filtered.filter(m => m.timestamp <= toTs);
  }

  if (filtered.length === 0) {
    alert("No hay movimientos en el historial que exportar con los filtros actuales.");
    return;
  }

  // Estructura de columnas
  const rows = filtered.map(m => ({
    "SKU": m.sku,
    "Descripción": m.descripcion,
    "Sucursal": m.sucursal,
    "Cambio Realizado": m.cambio > 0 ? `+${m.cambio}` : String(m.cambio),
    "Stock Anterior": m.stockAnterior,
    "Stock Nuevo": m.stockNuevo,
    "Hora": m.hora,
    "Fecha": m.fecha,
    "Operador": m.usuario || "Operador"
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Historial Movimientos");

  // Ajustar anchos
  worksheet['!cols'] = [
    {wch: 12}, {wch: 35}, {wch: 20}, {wch: 18}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 15}, {wch: 15}
  ];

  XLSX.writeFile(workbook, `Historial_Movimientos_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * PROCESA EL ARCHIVO EXCEL SELECCIONADO Y MUESTRA LA PREVISTA EN EL MODAL
 */
function handleImportFile(file) {
  if (!file) return;
  
  // Resetear vistas
  document.getElementById("import-preview-section").style.display = "none";
  document.getElementById("import-results-section").style.display = "none";
  document.getElementById("btn-execute-import").disabled = true;

  const filename = file.name;
  const sizeStr = (file.size / 1024).toFixed(1) + " KB";
  
  // Validar extensión
  const ext = filename.split('.').pop().toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') {
    alert("Por favor, seleccione un archivo de formato Excel válido (.xlsx o .xls).");
    return;
  }

  // Visualizar cargando en el drop zone
  const dropZone = document.getElementById("import-drop-zone");
  const originalHtml = dropZone.innerHTML;
  dropZone.innerHTML = `
    <i class="fas fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--accent-cyan); margin-bottom: 0.75rem;"></i>
    <p style="font-size: 0.9rem; font-weight: 600;">Analizando archivo Excel...</p>
  `;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rows.length < 2) {
        alert("El archivo Excel parece estar vacío o no tiene registros de neumáticos.");
        dropZone.innerHTML = originalHtml;
        return;
      }

      // Analizar las columnas: primera columna SKU (Código), segunda columna Descripción, tercera columna Stock
      // Usamos índices fijos: 0 = SKU, 1 = Descripción, 2 = Stock
      const parsedProducts = [];
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;
        
        // SKU/Código es columna 0 - Evitamos decimales de lectura (ej. 60040.0 -> 60040)
        let skuVal = "";
        if (row[0] !== undefined && row[0] !== null) {
          if (typeof row[0] === 'number') {
            skuVal = String(Math.floor(row[0]));
          } else {
            const rawStr = String(row[0]).trim();
            skuVal = rawStr.split('.')[0].split(',')[0];
          }
        }
        // Descripción es columna 1
        const descVal = String(row[1] !== undefined ? row[1] : "").trim();
        // Stock es columna 2
        const stockVal = parseInt(row[2] !== undefined ? row[2] : 0) || 0;

        if (!skuVal) continue; // Si no tiene SKU, lo omitimos

        parsedProducts.push({
          sku: skuVal,
          descripcion: descVal || "Neumático Importado",
          stock: stockVal,
          sector: "Importado Excel"
        });
      }

      if (parsedProducts.length === 0) {
        alert("No se pudieron encontrar registros de neumáticos válidos en el archivo Excel.");
        dropZone.innerHTML = originalHtml;
        return;
      }

      // Guardar en temporal
      AppState.tempImportData = {
        products: parsedProducts,
        filename: filename,
        size: sizeStr
      };

      // Mostrar diseño premium de archivo Excel cargado en el Drop Zone
      dropZone.innerHTML = `
        <i class="fas fa-file-excel" style="font-size: 3rem; color: var(--accent-emerald); margin-bottom: 0.75rem;"></i>
        <p style="font-size: 0.95rem; font-weight: 700; color: #ffffff; margin-bottom: 0.25rem;">${filename}</p>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.75rem;">Tamaño: ${sizeStr}</p>
        <span class="btn-secondary" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; display: inline-block;">Cambiar Archivo</span>
      `;

      // Auto-detectar sucursal por nombre de archivo
      const branchSelect = document.getElementById("import-branch-select");
      const lowerName = filename.toLowerCase();
      if (lowerName.includes("santiago") || lowerName.includes("marzo")) {
        branchSelect.value = "Santiago Marzo";
      } else if (lowerName.includes("coronel") || lowerName.includes("gil")) {
        branchSelect.value = "Coronel Gil";
      } else {
        // Fallback a filtro actual
        if (AppState.currentBranchFilter === "santiago") {
          branchSelect.value = "Santiago Marzo";
        } else if (AppState.currentBranchFilter === "coronel") {
          branchSelect.value = "Coronel Gil";
        }
      }

      // Mostrar previsiones en pantalla
      document.getElementById("import-filename").textContent = filename;
      document.getElementById("import-filesize").textContent = sizeStr;
      document.getElementById("import-rows-count").textContent = parsedProducts.length;
      
      document.getElementById("import-preview-section").style.display = "flex";
      document.getElementById("btn-execute-import").disabled = false;

    } catch (err) {
      console.error(err);
      alert("Error al leer el archivo Excel. Asegúrese de que no esté corrupto.");
      dropZone.innerHTML = originalHtml;
    }
  };
  
  reader.onerror = function() {
    alert("Error al cargar el archivo en memoria.");
    dropZone.innerHTML = originalHtml;
  };

  reader.readAsArrayBuffer(file);
}

/**
 * EJECUTA LA IMPORTACIÓN MASIVA EN LA SUCURSAL SELECCIONADA
 */
async function executeExcelImport() {
  if (!AppState.tempImportData) return;

  const btnExecute = document.getElementById("btn-execute-import");
  const btnCancel = document.getElementById("btn-cancel-import");
  const selectedBranch = document.getElementById("import-branch-select").value;

  btnExecute.disabled = true;
  btnCancel.disabled = true;
  btnExecute.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Importando...`;

  try {
    const overwriteStock = document.getElementById("import-overwrite-stock")?.checked || false;
    const res = await StockDB.importProductsBulk(
      AppState.tempImportData.products,
      selectedBranch,
      `Excel (${AppState.tempImportData.filename})`,
      overwriteStock
    );

    // Ocultar previsiones y drop zone
    document.getElementById("import-preview-section").style.display = "none";
    document.getElementById("import-drop-zone").style.display = "none";

    // Mostrar resultados
    document.getElementById("import-res-added").textContent = res.added;
    document.getElementById("import-res-updated").textContent = res.updated || 0;
    document.getElementById("import-res-skipped").textContent = res.skipped;
    document.getElementById("import-results-section").style.display = "flex";

    btnExecute.style.display = "none"; // Ocultar botón de importando/ejecutar una vez completado
    btnCancel.disabled = false;
    btnCancel.textContent = "Finalizar";
    
    // Limpiar estado temporal
    AppState.tempImportData = null;

  } catch (error) {
    alert("Error al procesar la importación en lote: " + error);
    btnExecute.disabled = false;
    btnCancel.disabled = false;
    btnExecute.innerHTML = `<i class="fas fa-check"></i> Procesar Importación`;
  }
}

/**
 * --- LÓGICA DE AUDITORÍA GNIK ---
 */

/**
 * Procesa el archivo Excel de stock Gnik y calcula discrepancias y diferencias contra Firebase en tiempo real
 */
function handleGnikAuditFile(file) {
  if (!file) return;

  const dropZone = document.getElementById("audit-drop-zone");
  const originalHtml = dropZone.innerHTML;
  dropZone.innerHTML = `
    <i class="fas fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--accent-emerald); margin-bottom: 0.75rem;"></i>
    <p style="font-size: 0.9rem; font-weight: 600;">Analizando reporte de stock Gnik...</p>
  `;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (rows.length < 6) {
        alert("El archivo Excel parece no contener suficientes filas. La planilla de Gnik debe tener datos a partir de la fila 6.");
        dropZone.innerHTML = originalHtml;
        return;
      }

      const gnikItems = [];
      const gnikSkusSet = new Set();

      // Fila 6 es índice 5
      for (let i = 5; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        // SKU/Código está en Col D (índice 3)
        let rawSku = row[3];
        if (rawSku === undefined || rawSku === null) continue;

        let skuVal = String(rawSku).trim();
        // Quitar la comilla simple del principio
        if (skuVal.startsWith("'")) {
          skuVal = skuVal.substring(1);
        }
        skuVal = skuVal.trim();
        // Evitar formatos decimales extraños
        skuVal = skuVal.split('.')[0].split(',')[0];

        if (!skuVal) continue;

        // Descripción está en Col E (índice 4)
        const descVal = String(row[4] !== undefined ? row[4] : "").trim();

        // Stock está en Col G (índice 6)
        const stockVal = parseInt(row[6] !== undefined ? row[6] : 0) || 0;

        // Agrupar stocks de SKUs duplicados en el mismo Excel
        const existing = gnikItems.find(item => item.sku === skuVal);
        if (existing) {
          existing.stock += stockVal;
        } else {
          gnikItems.push({
            sku: skuVal,
            descripcion: descVal || "Neumático Gnik",
            stock: stockVal
          });
        }
        gnikSkusSet.add(skuVal.toLowerCase());
      }

      if (gnikItems.length === 0) {
        alert("No se pudieron encontrar registros de stock de Gnik válidos en el archivo Excel (fila 6+, Col D, E, G).");
        dropZone.innerHTML = originalHtml;
        return;
      }

      // Determinar la sucursal de auditoría según la pestaña activa en AppState.currentBranchFilter
      let auditBranchName = "";
      if (AppState.currentBranchFilter === "santiago") {
        auditBranchName = "Santiago Marzo";
      } else if (AppState.currentBranchFilter === "coronel") {
        auditBranchName = "Coronel Gil";
      } else {
        auditBranchName = "Ambas Sucursales";
      }

      // Calcular inventario consolidado agrupado por SKU del sistema filtrado por la sucursal de auditoría
      const systemStockMap = new Map();
      AppState.products.forEach(p => {
        // Si no estamos en modo Combinado, solo auditar la sucursal activa
        if (auditBranchName !== "Ambas Sucursales" && p.sucursal !== auditBranchName) {
          return;
        }

        const skuClean = String(p.sku).trim();
        const skuKey = skuClean.toLowerCase();
        const stock = parseInt(p.stock) || 0;
        const isSantiago = p.sucursal === "Santiago Marzo";

        if (systemStockMap.has(skuKey)) {
          const item = systemStockMap.get(skuKey);
          item.stock += stock;
          if (isSantiago) {
            item.santiagoStock += stock;
          } else {
            item.coronelStock += stock;
          }
        } else {
          systemStockMap.set(skuKey, {
            sku: skuClean,
            descripcion: p.descripcion,
            stock: stock,
            santiagoStock: isSantiago ? stock : 0,
            coronelStock: isSantiago ? 0 : stock
          });
        }
      });

      // Categorización de diferencias
      const diff = [];
      const missingSys = [];
      const missingGnik = [];
      const ok = [];

      // Evaluar reporte Gnik contra el sistema
      gnikItems.forEach(g => {
        const skuKey = g.sku.toLowerCase();
        if (systemStockMap.has(skuKey)) {
          const s = systemStockMap.get(skuKey);
          const diffStock = s.stock - g.stock;
          
          const resultItem = {
            sku: g.sku,
            descripcion: s.descripcion || g.descripcion,
            stockGnik: g.stock,
            stockSistema: s.stock,
            santiagoStock: s.santiagoStock,
            coronelStock: s.coronelStock,
            diferencia: diffStock
          };

          if (diffStock !== 0) {
            diff.push(resultItem);
          } else {
            ok.push(resultItem);
          }
        } else {
          // No en el sistema
          missingSys.push({
            sku: g.sku,
            descripcion: g.descripcion,
            stockGnik: g.stock,
            stockSistema: 0,
            diferencia: -g.stock
          });
        }
      });

      // Evaluar sistema para ver si hay SKUs que Gnik no reportó
      systemStockMap.forEach((s, skuKey) => {
        if (!gnikSkusSet.has(skuKey)) {
          missingGnik.push({
            sku: s.sku,
            descripcion: s.descripcion,
            stockSistema: s.stock,
            santiagoStock: s.santiagoStock,
            coronelStock: s.coronelStock,
            stockGnik: 0,
            diferencia: s.stock
          });
        }
      });

      AppState.auditResults = {
        filename: file.name,
        filesize: (file.size / 1024).toFixed(1) + " KB",
        diff: diff,
        missingSys: missingSys,
        missingGnik: missingGnik,
        ok: ok
      };

      // Esconder drop zone y mostrar sección de resultados
      dropZone.style.display = "none";
      document.getElementById("audit-filename").textContent = file.name;
      document.getElementById("audit-filesize").textContent = AppState.auditResults.filesize;

      // Actualizar tarjetas rápidas
      document.getElementById("audit-stat-diff-count").textContent = diff.length;
      document.getElementById("audit-stat-missing-sys-count").textContent = missingSys.length;
      document.getElementById("audit-stat-missing-gnik-count").textContent = missingGnik.length;
      document.getElementById("audit-stat-ok-count").textContent = ok.length;

      // Actualizar contadores en pestañas
      document.getElementById("tab-diff-lbl").textContent = diff.length;
      document.getElementById("tab-missing-sys-lbl").textContent = missingSys.length;
      document.getElementById("tab-missing-gnik-lbl").textContent = missingGnik.length;
      document.getElementById("tab-ok-lbl").textContent = ok.length;

      document.getElementById("audit-results-section").style.display = "flex";

      // Seleccionar por defecto la pestaña con información relevante
      if (diff.length > 0) {
        setAuditTabActive("diff");
      } else if (missingSys.length > 0) {
        setAuditTabActive("missing-sys");
      } else if (missingGnik.length > 0) {
        setAuditTabActive("missing-gnik");
      } else {
        setAuditTabActive("ok");
      }

      renderAuditTable();

    } catch (err) {
      console.error(err);
      alert("Error al leer y auditar el reporte Gnik. Asegúrese de que no esté corrupto.");
      dropZone.innerHTML = originalHtml;
    }
  };

  reader.onerror = function() {
    alert("Error al cargar el archivo de auditoría.");
    dropZone.innerHTML = originalHtml;
  };

  reader.readAsArrayBuffer(file);
}

function setAuditTabActive(tabName) {
  AppState.currentAuditTab = tabName;
  document.querySelectorAll(".audit-tab-btn").forEach(btn => {
    if (btn.dataset.tab === tabName) btn.classList.add("active");
    else btn.classList.remove("active");
  });
  document.querySelectorAll(".audit-stat-card").forEach(card => {
    if (card.id === `card-stat-${tabName}`) card.classList.add("active");
    else card.classList.remove("active");
  });
}

/**
 * Renderiza la lista detallada de auditoría en la tabla interna del modal
 */
function renderAuditTable() {
  if (!AppState.auditResults) return;

  const tbody = document.getElementById("audit-table-body");
  const thead = document.getElementById("audit-table-head");
  if (!tbody || !thead) return;

  const currentTab = AppState.currentAuditTab;
  const isCombined = AppState.currentBranchFilter === "combinado";
  let items = AppState.auditResults[currentTab] || [];

  // Filtrado rápido por el buscador interno del modal
  if (AppState.auditSearchTerm) {
    const term = AppState.auditSearchTerm;
    items = items.filter(x => 
      String(x.sku).toLowerCase().includes(term) ||
      String(x.descripcion).toLowerCase().includes(term)
    );
  }

  // Configurar las cabeceras según la vista
  if (currentTab === "diff") {
    thead.innerHTML = `
      <tr>
        <th style="width: 15%; padding: 0.5rem 0.75rem;">SKU</th>
        <th style="width: 40%; padding: 0.5rem 0.75rem;">Descripción</th>
        <th style="width: 15%; padding: 0.5rem 0.75rem; text-align: center;">Sistema</th>
        <th style="width: 15%; padding: 0.5rem 0.75rem; text-align: center;">Gnik</th>
        <th style="width: 15%; padding: 0.5rem 0.75rem; text-align: center;">Diferencia</th>
      </tr>
    `;
  } else if (currentTab === "missing-sys") {
    thead.innerHTML = `
      <tr>
        <th style="width: 20%; padding: 0.5rem 0.75rem;">SKU</th>
        <th style="width: 60%; padding: 0.5rem 0.75rem;">Descripción</th>
        <th style="width: 20%; padding: 0.5rem 0.75rem; text-align: center;">Stock Gnik</th>
      </tr>
    `;
  } else if (currentTab === "missing-gnik") {
    thead.innerHTML = `
      <tr>
        <th style="width: 20%; padding: 0.5rem 0.75rem;">SKU</th>
        <th style="width: 60%; padding: 0.5rem 0.75rem;">Descripción</th>
        <th style="width: 20%; padding: 0.5rem 0.75rem; text-align: center;">Stock Sistema</th>
      </tr>
    `;
  } else if (currentTab === "ok") {
    thead.innerHTML = `
      <tr>
        <th style="width: 20%; padding: 0.5rem 0.75rem;">SKU</th>
        <th style="width: 60%; padding: 0.5rem 0.75rem;">Descripción</th>
        <th style="width: 20%; padding: 0.5rem 0.75rem; text-align: center;">Stock Coincidente</th>
      </tr>
    `;
  }

  // Renderizar filas
  if (items.length === 0) {
    const cols = currentTab === "diff" ? 5 : 3;
    tbody.innerHTML = `
      <tr>
        <td colspan="${cols}" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No hay registros de neumáticos que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  items.forEach(x => {
    if (currentTab === "diff") {
      const isSobrante = x.diferencia > 0;
      const diffSign = isSobrante ? `+${x.diferencia}` : `${x.diferencia}`;
      const diffColor = isSobrante ? "var(--accent-amber)" : "var(--accent-rose)";
      const diffText = isSobrante ? "Sobrante Sistema" : "Faltante Sistema";
      
      html += `
        <tr>
          <td style="padding: 0.4rem 0.75rem;"><strong>${x.sku}</strong></td>
          <td style="padding: 0.4rem 0.75rem;">${x.descripcion}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold;">
            ${x.stockSistema} 
            ${isCombined ? 
              `<span style="font-size:0.65rem; color:var(--text-muted); display:block; font-weight:normal;">(S: ${x.santiagoStock} / C: ${x.coronelStock})</span>` : 
              ''
            }
          </td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold; color: var(--accent-cyan);">${x.stockGnik}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold; color: ${diffColor};">
            ${diffSign}
            <span style="font-size: 0.65rem; display: block; font-weight: normal; opacity: 0.85;">${diffText}</span>
          </td>
        </tr>
      `;
    } else if (currentTab === "missing-sys") {
      html += `
        <tr>
          <td style="padding: 0.4rem 0.75rem;"><strong>${x.sku}</strong></td>
          <td style="padding: 0.4rem 0.75rem;">${x.descripcion}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold; color: var(--accent-amber);">${x.stockGnik}</td>
        </tr>
      `;
    } else if (currentTab === "missing-gnik") {
      html += `
        <tr>
          <td style="padding: 0.4rem 0.75rem;"><strong>${x.sku}</strong></td>
          <td style="padding: 0.4rem 0.75rem;">${x.descripcion}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold; color: var(--accent-cyan);">
            ${x.stockSistema}
            ${isCombined ? 
              `<span style="font-size:0.65rem; color:var(--text-muted); display:block; font-weight:normal;">(S: ${x.santiagoStock} / C: ${x.coronelStock})</span>` : 
              ''
            }
          </td>
        </tr>
      `;
    } else if (currentTab === "ok") {
      html += `
        <tr>
          <td style="padding: 0.4rem 0.75rem;"><strong>${x.sku}</strong></td>
          <td style="padding: 0.4rem 0.75rem;">${x.descripcion}</td>
          <td style="padding: 0.4rem 0.75rem; text-align: center; font-weight: bold; color: var(--accent-emerald);">${x.stockGnik}</td>
        </tr>
      `;
    }
  });

  tbody.innerHTML = html;
}

/**
 * Exporta un libro de Excel completo (.xlsx) con 4 solapas representando cada categoría del reporte de auditoría
 */
function exportGnikAuditExcel() {
  if (!AppState.auditResults) return;
  if (typeof XLSX === "undefined") {
    alert("La librería de exportación de Excel aún está cargando.");
    return;
  }

  const results = AppState.auditResults;
  const workbook = XLSX.utils.book_new();
  const isCombined = AppState.currentBranchFilter === "combinado";
  const branchName = AppState.currentBranchFilter === "santiago" ? "Santiago Marzo" : 
                     (AppState.currentBranchFilter === "coronel" ? "Coronel Gil" : "Combinado");

  // 1. Hoja Diferencias
  const diffRows = results.diff.map(x => {
    const row = {
      "SKU": x.sku,
      "Descripción": x.descripcion,
      "Stock Sistema": x.stockSistema,
    };
    if (isCombined) {
      row["Santiago Marzo Stock"] = x.santiagoStock;
      row["Coronel Gil Stock"] = x.coronelStock;
    }
    row["Stock Gnik"] = x.stockGnik;
    row["Diferencia (Sistema - Gnik)"] = x.diferencia;
    row["Estado"] = x.diferencia > 0 ? "Sobrante en Sistema" : "Faltante en Sistema";
    return row;
  });
  const wsDiff = XLSX.utils.json_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(workbook, wsDiff, "Diferencias de Stock");
  wsDiff['!cols'] = isCombined ? 
    [{wch: 12}, {wch: 35}, {wch: 15}, {wch: 18}, {wch: 18}, {wch: 15}, {wch: 22}, {wch: 20}] :
    [{wch: 12}, {wch: 35}, {wch: 15}, {wch: 15}, {wch: 22}, {wch: 20}];

  // 2. Hoja No en Sistema
  const missingSysRows = results.missingSys.map(x => ({
    "SKU": x.sku,
    "Descripción": x.descripcion,
    "Stock Gnik": x.stockGnik
  }));
  const wsMissingSys = XLSX.utils.json_to_sheet(missingSysRows);
  XLSX.utils.book_append_sheet(workbook, wsMissingSys, "No en Sistema");
  wsMissingSys['!cols'] = [{wch: 12}, {wch: 35}, {wch: 15}];

  // 3. Hoja No en Gnik
  const missingGnikRows = results.missingGnik.map(x => {
    const row = {
      "SKU": x.sku,
      "Descripción": x.descripcion,
      "Stock Sistema": x.stockSistema,
    };
    if (isCombined) {
      row["Santiago Marzo Stock"] = x.santiagoStock;
      row["Coronel Gil Stock"] = x.coronelStock;
    }
    return row;
  });
  const wsMissingGnik = XLSX.utils.json_to_sheet(missingGnikRows);
  XLSX.utils.book_append_sheet(workbook, wsMissingGnik, "No en Gnik");
  wsMissingGnik['!cols'] = isCombined ?
    [{wch: 12}, {wch: 35}, {wch: 15}, {wch: 18}, {wch: 18}] :
    [{wch: 12}, {wch: 35}, {wch: 15}];

  // 4. Hoja Coincidentes (OK)
  const okRows = results.ok.map(x => ({
    "SKU": x.sku,
    "Descripción": x.descripcion,
    "Stock": x.stockGnik
  }));
  const wsOk = XLSX.utils.json_to_sheet(okRows);
  XLSX.utils.book_append_sheet(workbook, wsOk, "Coincidentes OK");
  wsOk['!cols'] = [{wch: 12}, {wch: 35}, {wch: 15}];

  // Descargar el reporte completo
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `Reporte_Auditoria_Gnik_${branchName.replace(/ /g, "_")}_${dateStr}.xlsx`);
}


