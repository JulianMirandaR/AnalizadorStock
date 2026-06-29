/**
 * StockDB - Servicio de Base de Datos para Gestión de Stock de Neumáticos
 * Soporta persistencia dual: LocalStorage (para rapidez y offline) y Firebase Firestore (tiempo real).
 */

const StockDB = {
  // Configuración de estado
  firebaseConfig: null,
  db: null,
  
  // Callbacks de actualización en tiempo real
  onProductsChangeCallback: null,
  onMovementsChangeCallback: null,

  // Referencias a desuscripciones de Firebase
  unsubscribeProducts: null,
  unsubscribeMovements: null,

  // Modo local / offline fallback
  isOfflineMode: false,
  offlineProducts: [],
  offlineMovements: [],

  /**
   * Inicializa la base de datos
   */
  async init(onProductsUpdate, onMovementsUpdate) {
    this.onProductsChangeCallback = onProductsUpdate;
    this.onMovementsChangeCallback = onMovementsUpdate;

    // 1. Intentar cargar configuración guardada por el usuario en localStorage
    const savedConfig = localStorage.getItem("firebase_config");
    if (savedConfig) {
      try {
        this.firebaseConfig = JSON.parse(savedConfig);
      } catch (e) {
        console.error("Error al parsear config de Firebase guardada:", e);
      }
    }

    // 2. Si no hay en localStorage, usar configuración física de config.js
    if (!this.firebaseConfig) {
      const hasPhysicalConfig = window.FIREBASE_CONFIG && 
                                window.FIREBASE_CONFIG.apiKey && 
                                !window.FIREBASE_CONFIG.apiKey.includes("AQUÍ") && 
                                window.FIREBASE_CONFIG.apiKey.trim() !== "";
      if (hasPhysicalConfig) {
        this.firebaseConfig = window.FIREBASE_CONFIG;
      }
    }

    if (this.firebaseConfig) {
      const initialized = await this.initFirebase();
      if (initialized) {
        console.log("Servidor Firebase Firestore inicializado correctamente.");
        return true;
      }
    } else {
      // Mostrar advertencia visual de credenciales pendientes
      this.showConfigurationPendingUI();
    }

    this.activateLocalOfflineMode("Configuración de servidor pendiente o fallida.");
    return false;
  },

  /**
   * Muestra un banner visual si las credenciales de config.js no han sido ingresadas
   */
  showConfigurationPendingUI() {
    const tbody = document.getElementById("table-body");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 4rem 2rem; color: var(--accent-amber);">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <h3 style="color: #ffffff; margin-bottom: 0.5rem;">Configuración de Servidor Pendiente</h3>
            <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 450px; margin: 0 auto 1.5rem auto; line-height: 1.4;">
              Por favor, abra el archivo <strong>config.js</strong> en su editor y reemplace las llaves de ejemplo con las credenciales de su proyecto Firebase Web App.
            </p>
            <span class="badge-branch santiago" style="padding: 0.5rem 1rem;">Esperando conexión con el servidor...</span>
          </td>
        </tr>
      `;
    }
  },

  /**
   * Inicializa Firebase Firestore
   */
  async initFirebase() {
    try {
      if (!this.firebaseConfig) return false;

      // Verificar si firebase está cargado mediante CDN
      if (typeof firebase === "undefined") {
        console.warn("SDK de Firebase no está cargado. Asegúrese de que index.html tiene las etiquetas de script correctas.");
        return false;
      }

      // Si ya hay aplicaciones inicializadas, las reutilizamos o cerramos
      if (firebase.apps.length === 0) {
        firebase.initializeApp(this.firebaseConfig);
      }
      
      this.db = firebase.firestore();
      
      // Forzar long-polling para solucionar net::ERR_QUIC_PROTOCOL_ERROR e HTTP 400 en redes móviles/bloqueadas
      try {
        this.db.settings({
          experimentalForceLongPolling: true
        });
      } catch (err) {
        console.warn("No se pudo configurar experimentalForceLongPolling:", err);
      }
      
      // Habilitar persistencia offline en Firestore si está disponible
      try {
        await this.db.enablePersistence({ synchronizeTabs: true });
      } catch (err) {
        console.warn("Persistencia offline de Firestore no habilitada:", err.code);
      }

      // Configurar Listeners en tiempo real para Productos
      this.unsubscribeProducts = this.db.collection("products")
        .onSnapshot((querySnapshot) => {
          const products = [];
          querySnapshot.forEach((doc) => {
            products.push({ id: doc.id, ...doc.data() });
          });
          
          localStorage.setItem("offline_products", JSON.stringify(products));

          if (this.onProductsChangeCallback) {
            this.onProductsChangeCallback(products);
          }
        }, (error) => {
          console.error("Error en Snapshot de Productos de Firebase:", error);
          this.activateLocalOfflineMode("Error en snapshot de productos.");
        });

      // Configurar Listeners en tiempo real para Movimientos
      this.unsubscribeMovements = this.db.collection("movements")
        .orderBy("timestamp", "desc")
        .limit(1000) // Límite razonable para carga rápida
        .onSnapshot((querySnapshot) => {
          const movements = [];
          querySnapshot.forEach((doc) => {
            movements.push({ id: doc.id, ...doc.data() });
          });

          localStorage.setItem("offline_movements", JSON.stringify(movements));

          if (this.onMovementsChangeCallback) {
            this.onMovementsChangeCallback(movements);
          }
        }, (error) => {
          console.error("Error en Snapshot de Movimientos de Firebase:", error);
        });

      this.updateConnectionStatusIndicator(true);
      return true;
    } catch (error) {
      console.error("Error al conectar con Firebase:", error);
      this.activateLocalOfflineMode("Excepción al conectar con Firebase.");
      return false;
    }
  },

  /**
   * Actualiza el indicador visual en el navbar
   */
  updateConnectionStatusIndicator(isOnline) {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    if (!dot || !text) return;

    if (isOnline && !this.isOfflineMode) {
      dot.className = "status-dot online";
      text.textContent = "Sincronizado";
      text.style.color = "var(--accent-emerald)";
    } else if (this.isOfflineMode) {
      dot.className = "status-dot local";
      text.textContent = "Modo Local (Sin Conexión)";
      text.style.color = "var(--accent-amber)";
    } else {
      dot.className = "status-dot";
      text.textContent = "Error de Conexión";
      text.style.color = "var(--accent-rose)";
    }
  },

  /**
   * Cierra las conexiones activas de Firebase
   */
  disconnectFirebase() {
    if (this.unsubscribeProducts) {
      this.unsubscribeProducts();
      this.unsubscribeProducts = null;
    }
    if (this.unsubscribeMovements) {
      this.unsubscribeMovements();
      this.unsubscribeMovements = null;
    }
    this.db = null;
  },

  /**
   * Activa el modo de funcionamiento local/offline cargando los datos guardados en LocalStorage.
   */
  activateLocalOfflineMode(reason) {
    this.isOfflineMode = true;
    console.warn("Cambiando a Modo Local Offline. Razón:", reason);
    
    let localProds = [];
    const savedProds = localStorage.getItem("offline_products");
    if (savedProds) {
      try {
        localProds = JSON.parse(savedProds);
      } catch (e) {
        console.error("Error al parsear productos locales:", e);
      }
    }
    
    if (localProds.length === 0 && typeof INITIAL_MOCK_PRODUCTS !== "undefined") {
      localProds = [...INITIAL_MOCK_PRODUCTS];
      localStorage.setItem("offline_products", JSON.stringify(localProds));
    }
    
    this.offlineProducts = localProds;

    let localMovements = [];
    const savedMovements = localStorage.getItem("offline_movements");
    if (savedMovements) {
      try {
        localMovements = JSON.parse(savedMovements);
      } catch (e) {
        console.error("Error al parsear movimientos locales:", e);
      }
    }
    this.offlineMovements = localMovements;

    if (this.onProductsChangeCallback) {
      this.onProductsChangeCallback(this.offlineProducts);
    }
    if (this.onMovementsChangeCallback) {
      this.onMovementsChangeCallback(this.offlineMovements);
    }

    this.updateConnectionStatusIndicator(false);
  },

  /**
   * Retorna todos los productos actuales (vacío en consulta síncrona ya que Firestore es asíncrono)
   */
  getProductsSync() {
    return [];
  },

  /**
   * Modifica el stock de un producto
   */
  async updateStock(productId, changeAmount, operatorName = "Operador") {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0]; // "17:55:30"
    const dateStr = now.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).replace(/\//g, "-"); // "26-05-2026"
    const timestamp = now.getTime();

    if (this.isOfflineMode) {
      const prod = this.offlineProducts.find(p => p.id === productId);
      if (!prod) throw new Error("El producto no existe localmente.");
      
      const currentStock = prod.stock || 0;
      const newStock = Math.max(0, currentStock + changeAmount);
      prod.stock = newStock;
      prod.acomodado = true;
      
      const newMove = {
        id: `move-local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sku: prod.sku || "",
        descripcion: prod.descripcion || "",
        cambio: changeAmount,
        stockAnterior: currentStock,
        stockNuevo: newStock,
        hora: timeStr,
        fecha: dateStr,
        timestamp: timestamp,
        usuario: operatorName || "Operador",
        sucursal: prod.sucursal || ""
      };
      
      this.offlineMovements.unshift(newMove);
      
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      localStorage.setItem("offline_movements", JSON.stringify(this.offlineMovements));
      
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      if (this.onMovementsChangeCallback) this.onMovementsChangeCallback(this.offlineMovements);
      
      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }

    try {
      const prodRef = this.db.collection("products").doc(productId);
      
      await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(prodRef);
        if (!doc.exists) {
          throw new Error("El producto no existe en el servidor.");
        }
        
        const currentStock = doc.data().stock || 0;
        const newStock = Math.max(0, currentStock + changeAmount);
        
        // Actualizar stock de neumático y marcar como acomodado para persistencia en el servidor
        transaction.update(prodRef, { 
          stock: newStock, 
          acomodado: true 
        });
        
        // Registrar movimiento histórico
        const moveRef = this.db.collection("movements").doc();
        transaction.set(moveRef, {
          sku: doc.data().sku || "",
          descripcion: doc.data().descripcion || "",
          cambio: changeAmount,
          stockAnterior: currentStock,
          stockNuevo: newStock,
          hora: timeStr,
          fecha: dateStr,
          timestamp: timestamp,
          usuario: operatorName || "Operador",
          sucursal: doc.data().sucursal || ""
        });
      });
      return true;
    } catch (error) {
      console.error("Error al actualizar stock en Firebase:", error);
      throw error;
    }
  },

  /**
   * Restablece el estado acomodado en false para todos los productos en Firebase
   */
  async resetAcomodados() {
    if (this.isOfflineMode) {
      this.offlineProducts.forEach(p => p.acomodado = false);
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    try {
      const snapshot = await this.db.collection("products")
        .where("acomodado", "==", true)
        .get();
      
      if (snapshot.empty) return true;

      let batch = this.db.batch();
      let count = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, { acomodado: false });
        count++;
        if (count === 400) {
          await batch.commit();
          batch = this.db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      return true;
    } catch (error) {
      console.error("Error al restablecer productos acomodados en Firebase:", error);
      throw error;
    }
  },

  /**
   * Modifica campos informativos del producto (SKU, Descripción, Sector, Sucursal)
   */
  async updateProductFields(productId, updatedFields) {
    if (this.isOfflineMode) {
      const prod = this.offlineProducts.find(p => p.id === productId);
      if (!prod) throw new Error("El producto no existe localmente.");
      
      Object.assign(prod, updatedFields);
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    try {
      const prodRef = this.db.collection("products").doc(productId);
      await prodRef.update(updatedFields);
      return true;
    } catch (error) {
      console.error("Error al actualizar campos del producto en Firebase:", error);
      throw error;
    }
  },

  /**
   * Crea un nuevo producto en el catálogo
   */
  async addProduct(productData) {
    if (this.isOfflineMode) {
      const newId = `prod-local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newProduct = {
        id: newId,
        sku: productData.sku || "",
        descripcion: productData.descripcion || "Nuevo Neumático",
        stock: parseInt(productData.stock) || 0,
        sector: productData.sector || "",
        sucursal: productData.sucursal || "Santiago Marzo",
        acomodado: false
      };
      
      this.offlineProducts.push(newProduct);
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      return newId;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    const newProduct = {
      sku: productData.sku || "",
      descripcion: productData.descripcion || "Nuevo Neumático",
      stock: parseInt(productData.stock) || 0,
      sector: productData.sector || "",
      sucursal: productData.sucursal || "Santiago Marzo"
    };

    try {
      const docRef = await this.db.collection("products").add(newProduct);
      return docRef.id;
    } catch (error) {
      console.error("Error al agregar producto en Firebase:", error);
      throw error;
    }
  },

  /**
   * Elimina un producto por ID
   */
  async deleteProduct(productId) {
    if (this.isOfflineMode) {
      this.offlineProducts = this.offlineProducts.filter(p => p.id !== productId);
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    try {
      await this.db.collection("products").doc(productId).delete();
      return true;
    } catch (error) {
      console.error("Error al eliminar producto en Firebase:", error);
      throw error;
    }
  },
  /**
   * Importa un lote de productos en bulk (para cargas de Excel).
   * Omite o sobrescribe los productos que ya existen en la sucursal seleccionada basándose en el SKU.
   */
  async importProductsBulk(productsArray, branchName, operatorName = "Operador (Excel)", overwriteExistingStock = false) {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    const dateStr = now.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).replace(/\//g, "-");
    const timestamp = now.getTime();

    if (this.isOfflineMode) {
      const existingProductsMap = new Map(
        this.offlineProducts
          .filter(p => p.sucursal === branchName)
          .map(p => [String(p.sku).trim().toLowerCase(), p])
      );

      const newProductsToImport = [];
      const productsToUpdate = [];
      const importedSkusInBatch = new Set();

      productsArray.forEach(p => {
        const skuStr = String(p.sku || "").trim();
        const skuLower = skuStr.toLowerCase();
        
        if (!skuStr) return;
        if (importedSkusInBatch.has(skuLower)) return;
        importedSkusInBatch.add(skuLower);

        const existingProduct = existingProductsMap.get(skuLower);

        if (existingProduct) {
          if (overwriteExistingStock) {
            const newStock = Math.max(0, parseInt(p.stock) || 0);
            if (existingProduct.stock !== newStock) {
              productsToUpdate.push({
                product: existingProduct,
                stockAnterior: existingProduct.stock,
                stockNuevo: newStock
              });
            }
          }
        } else {
          newProductsToImport.push({
            id: `prod-local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${newProductsToImport.length}`,
            sku: skuStr,
            descripcion: String(p.descripcion || "Neumático Importado").trim(),
            stock: Math.max(0, parseInt(p.stock) || 0),
            sector: String(p.sector || "").trim(),
            sucursal: branchName,
            acomodado: false
          });
        }
      });

      newProductsToImport.forEach(prod => this.offlineProducts.push(prod));

      productsToUpdate.forEach(item => {
        item.product.stock = item.stockNuevo;
      });

      const totalDiff = newProductsToImport.reduce((acc, p) => acc + p.stock, 0) +
                        productsToUpdate.reduce((acc, p) => acc + (p.stockNuevo - p.stockAnterior), 0);

      let consolidationMsg = `Importados ${newProductsToImport.length} neumáticos nuevos desde Excel`;
      if (productsToUpdate.length > 0) {
        consolidationMsg += ` y actualizados ${productsToUpdate.length} existentes`;
      }

      const newMove = {
        id: `move-local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sku: "IMPORT",
        descripcion: consolidationMsg,
        cambio: totalDiff,
        stockAnterior: 0,
        stockNuevo: totalDiff,
        hora: timeStr,
        fecha: dateStr,
        timestamp: timestamp,
        usuario: operatorName,
        sucursal: branchName
      };

      this.offlineMovements.unshift(newMove);

      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      localStorage.setItem("offline_movements", JSON.stringify(this.offlineMovements));

      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      if (this.onMovementsChangeCallback) this.onMovementsChangeCallback(this.offlineMovements);

      return { added: newProductsToImport.length, updated: productsToUpdate.length, skipped: productsArray.length - newProductsToImport.length - productsToUpdate.length };
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }

    // 1. Obtener productos cargados para verificar existentes por SKU en esta sucursal
    let currentProducts = [];
    try {
      const snapshot = await this.db.collection("products")
        .where("sucursal", "==", branchName)
        .get();
      snapshot.forEach(doc => {
        currentProducts.push({ id: doc.id, ...doc.data() });
      });
    } catch (err) {
      console.error("Error al validar SKUs en Firebase, usando caché local:", err);
      currentProducts = typeof AppState !== "undefined" ? AppState.products : [];
    }

    // Mapa de productos existentes en esta sucursal por SKU (para búsqueda rápida)
    const existingProductsMap = new Map(
      currentProducts
        .filter(p => p.sucursal === branchName)
        .map(p => [String(p.sku).trim().toLowerCase(), p])
    );

    const newProductsToImport = [];
    const productsToUpdate = [];
    const importedSkusInBatch = new Set();

    productsArray.forEach(p => {
      const skuStr = String(p.sku || "").trim();
      const skuLower = skuStr.toLowerCase();
      
      if (!skuStr) return; // Omitir si no tiene SKU
      
      // Evitar duplicados dentro del mismo archivo Excel
      if (importedSkusInBatch.has(skuLower)) return;
      importedSkusInBatch.add(skuLower);

      const existingProduct = existingProductsMap.get(skuLower);

      if (existingProduct) {
        if (overwriteExistingStock) {
          const newStock = Math.max(0, parseInt(p.stock) || 0);
          // Solo actualizar si el stock es diferente
          if (existingProduct.stock !== newStock) {
            productsToUpdate.push({
              id: existingProduct.id,
              sku: skuStr,
              descripcion: existingProduct.descripcion,
              stockAnterior: existingProduct.stock,
              stockNuevo: newStock,
              sector: existingProduct.sector
            });
          }
        }
      } else {
        newProductsToImport.push({
          sku: skuStr,
          descripcion: String(p.descripcion || "Neumático Importado").trim(),
          stock: Math.max(0, parseInt(p.stock) || 0),
          sector: String(p.sector || "").trim(),
          sucursal: branchName
        });
      }
    });

    const totalProcessed = productsArray.length;
    const addedCount = newProductsToImport.length;
    const updatedCount = productsToUpdate.length;
    const skippedCount = totalProcessed - addedCount - updatedCount;

    if (addedCount === 0 && updatedCount === 0) {
      return { added: 0, updated: 0, skipped: skippedCount };
    }

    try {
      // Guardar en Firebase en lotes/batches de 400 (para no superar el límite de 500 de Firestore)
      const allOperations = [];
      
      // Operaciones de inserción
      newProductsToImport.forEach(prod => {
        allOperations.push({
          type: 'set',
          ref: this.db.collection("products").doc(),
          data: prod
        });
      });

      // Operaciones de actualización
      productsToUpdate.forEach(prod => {
        allOperations.push({
          type: 'update',
          ref: this.db.collection("products").doc(prod.id),
          data: { stock: prod.stockNuevo }
        });
      });

      const chunks = [];
      const chunkSize = 400;
      for (let i = 0; i < allOperations.length; i += chunkSize) {
        chunks.push(allOperations.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const batch = this.db.batch();
        chunk.forEach(op => {
          if (op.type === 'set') {
            batch.set(op.ref, op.data);
          } else if (op.type === 'update') {
            batch.update(op.ref, op.data);
          }
        });
        await batch.commit();
      }

      // Registrar un movimiento consolidado en el historial
      const totalImportedStock = newProductsToImport.reduce((acc, p) => acc + p.stock, 0);
      const totalUpdatedStockDiff = productsToUpdate.reduce((acc, p) => acc + (p.stockNuevo - p.stockAnterior), 0);
      const totalDiff = totalImportedStock + totalUpdatedStockDiff;

      let consolidationMsg = `Importados ${addedCount} neumáticos nuevos desde Excel`;
      if (updatedCount > 0) {
        consolidationMsg += ` y actualizados ${updatedCount} existentes`;
      }

      await this.db.collection("movements").add({
        sku: "IMPORT",
        descripcion: consolidationMsg,
        cambio: totalDiff,
        stockAnterior: 0,
        stockNuevo: totalDiff,
        hora: timeStr,
        fecha: dateStr,
        timestamp: timestamp,
        usuario: operatorName,
        sucursal: branchName
      });

      return { added: addedCount, updated: updatedCount, skipped: skippedCount };
    } catch (error) {
      console.error("Error al realizar importación en bulk a Firebase:", error);
      throw error;
    }
  },

  /**
   * Reinicia la base de datos local borrando la caché local y re-inicializando con mock-data
   */
  /**
   * Borra absolutamente todos los productos y movimientos del catálogo para iniciar de cero.
   */
  async clearAllProducts() {
    if (this.isOfflineMode) {
      this.offlineProducts = [];
      this.offlineMovements = [];
      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      localStorage.setItem("offline_movements", JSON.stringify(this.offlineMovements));
      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      if (this.onMovementsChangeCallback) this.onMovementsChangeCallback(this.offlineMovements);
      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    try {
      const productsSnapshot = await this.db.collection("products").get();
      const movementsSnapshot = await this.db.collection("movements").get();
      
      const allDocs = [];
      productsSnapshot.forEach(doc => allDocs.push(doc.ref));
      movementsSnapshot.forEach(doc => allDocs.push(doc.ref));
      
      if (allDocs.length === 0) return true;
      
      // Borrar en lotes de 400 para evitar superar el límite de 500 de Firestore
      const chunkSize = 400;
      for (let i = 0; i < allDocs.length; i += chunkSize) {
        const chunk = allDocs.slice(i, i + chunkSize);
        const batch = this.db.batch();
        chunk.forEach(docRef => batch.delete(docRef));
        await batch.commit();
      }
      
      return true;
    } catch (err) {
      console.error("Error al vaciar colecciones en Firebase:", err);
      throw err;
    }
  },

  /**
   * Pone el stock de todos los productos en 0 y restablece el estado acomodado en false.
   */
  async resetAllStocksToZero() {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    const dateStr = now.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).replace(/\//g, "-");
    const timestamp = now.getTime();

    if (this.isOfflineMode) {
      this.offlineProducts.forEach(p => {
        p.stock = 0;
        p.acomodado = false;
      });

      const newMove = {
        id: `move-local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sku: "RESET",
        descripcion: "Se restableció el stock de todos los neumáticos a 0",
        cambio: 0,
        stockAnterior: 0,
        stockNuevo: 0,
        hora: timeStr,
        fecha: dateStr,
        timestamp: timestamp,
        usuario: "Operador",
        sucursal: "Ambas Sucursales"
      };

      this.offlineMovements.unshift(newMove);

      localStorage.setItem("offline_products", JSON.stringify(this.offlineProducts));
      localStorage.setItem("offline_movements", JSON.stringify(this.offlineMovements));

      if (this.onProductsChangeCallback) this.onProductsChangeCallback(this.offlineProducts);
      if (this.onMovementsChangeCallback) this.onMovementsChangeCallback(this.offlineMovements);

      return true;
    }

    if (!this.db) {
      throw new Error("No hay conexión activa con el servidor Firebase.");
    }
    try {
      const snapshot = await this.db.collection("products").get();
      if (snapshot.empty) return true;

      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0];
      const dateStr = now.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).replace(/\//g, "-");
      const timestamp = now.getTime();

      let batch = this.db.batch();
      let count = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, { 
          stock: 0,
          acomodado: false
        });
        count++;
        if (count === 400) {
          await batch.commit();
          batch = this.db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }

      // Registrar movimiento consolidado en el historial
      await this.db.collection("movements").add({
        sku: "RESET",
        descripcion: "Se restableció el stock de todos los neumáticos a 0",
        cambio: 0,
        stockAnterior: 0,
        stockNuevo: 0,
        hora: timeStr,
        fecha: dateStr,
        timestamp: timestamp,
        usuario: "Operador",
        sucursal: "Ambas Sucursales"
      });

      return true;
    } catch (error) {
      console.error("Error al poner todo el stock en 0 en Firebase:", error);
      throw error;
    }
  },

  saveFirebaseConfig(config) {
    localStorage.setItem("firebase_config", JSON.stringify(config));
    this.firebaseConfig = config;
    return this.initFirebase();
  }
};
