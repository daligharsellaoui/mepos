import { query, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

function resolveTenantFilter(tenantId?: number | null): number | undefined {
  if (tenantId === null) return undefined;
  return tenantId ?? 1;
}

function validateEmail(email?: string): boolean {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone?: string): boolean {
  if (!phone) return true;
  return /^[\d\s\-\+\(\)]{8,20}$/.test(phone);
}

export async function getAllSuppliers(
  tenantId?: number | null,
  search?: string,
  status?: string,
  preferred?: string,
  country?: string,
  sortBy?: string,
  sortDir?: string,
  page?: number,
  perPage?: number
): Promise<{ suppliers: any[]; total: number; page: number; perPage: number; totalPages: number }> {
  const filter = resolveTenantFilter(tenantId);
  const currentPage = page || 1;
  const itemsPerPage = perPage || 10;
  const offset = (currentPage - 1) * itemsPerPage;

  if (isDemoMode) {
    let suppliers = filter
      ? demoDb.suppliers.filter((s: any) => s.tenant_id === filter)
      : [...demoDb.suppliers];

    if (search) {
      const q = search.toLowerCase();
      suppliers = suppliers.filter((s: any) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.company_name && s.company_name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.tax_number && s.tax_number.toLowerCase().includes(q)) ||
        (s.contact_person && s.contact_person.toLowerCase().includes(q))
      );
    }
    if (status) {
      suppliers = suppliers.filter((s: any) => s.status === status);
    }
    if (preferred !== null && preferred !== undefined && preferred !== '') {
      const isPreferred = preferred === 'true';
      suppliers = suppliers.filter((s: any) => s.preferred === isPreferred);
    }
    if (country) {
      suppliers = suppliers.filter((s: any) => s.country === country);
    }

    const validSortFields = ['name', 'company_name', 'city', 'email', 'created_at', 'rating', 'status'];
    const field = validSortFields.includes(sortBy || '') ? sortBy! : 'name';
    const dir = sortDir === 'desc' ? -1 : 1;
    suppliers.sort((a: any, b: any) => {
      const aVal = (a[field] || '').toString().toLowerCase();
      const bVal = (b[field] || '').toString().toLowerCase();
      return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
    });

    const total = suppliers.length;
    const paginated = suppliers.slice(offset, offset + itemsPerPage);
    return {
      suppliers: paginated,
      total,
      page: currentPage,
      perPage: itemsPerPage,
      totalPages: Math.ceil(total / itemsPerPage),
    };
  }

  let sql = 'SELECT * FROM suppliers WHERE tenant_id = $1';
  const params: any[] = [filter ?? 1];
  let paramIndex = 2;

  if (search) {
    sql += ` AND (LOWER(name) LIKE $${paramIndex} OR LOWER(company_name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex} OR LOWER(phone) LIKE $${paramIndex} OR LOWER(city) LIKE $${paramIndex} OR LOWER(tax_number) LIKE $${paramIndex} OR LOWER(contact_person) LIKE $${paramIndex})`;
    params.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }
  if (status) {
    sql += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  if (preferred !== null && preferred !== undefined && preferred !== '') {
    sql += ` AND preferred = $${paramIndex}`;
    params.push(preferred === 'true');
    paramIndex++;
  }
  if (country) {
    sql += ` AND country = $${paramIndex}`;
    params.push(country);
    paramIndex++;
  }

  const countResult = await query(sql.replace('SELECT *', 'SELECT COUNT(*)'), params);
  const total = parseInt(countResult.rows[0].count, 10);

  const validSortFields = ['name', 'company_name', 'city', 'email', 'created_at', 'rating', 'status'];
  const field = validSortFields.includes(sortBy || '') ? sortBy! : 'name';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
  sql += ` ORDER BY ${field} ${dir} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(itemsPerPage, offset);

  const result = await query(sql, params);
  return {
    suppliers: result.rows,
    total,
    page: currentPage,
    perPage: itemsPerPage,
    totalPages: Math.ceil(total / itemsPerPage),
  };
}

export async function getSupplierById(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  if (isDemoMode) {
    const supplier = filter
      ? demoDb.suppliers.find((s: any) => s.id === id && s.tenant_id === filter)
      : demoDb.suppliers.find((s: any) => s.id === id);
    if (!supplier) return null;

    const ingredientsCount = demoDb.ingredients.filter(
      (i: any) => i.preferred_supplier_id === id && (filter ? i.tenant_id === filter : true)
    ).length;

    return { ...supplier, ingredients_count: ingredientsCount };
  }

  const result = await query(
    `SELECT s.*,
            (SELECT COUNT(*) FROM ingredients WHERE preferred_supplier_id = s.id AND tenant_id = $2) as ingredients_count
     FROM suppliers s WHERE s.id = $1 AND s.tenant_id = $2`,
    [id, filter ?? 1]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function createSupplier(data: any, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (!data.name) {
    throw new Error('Le nom du fournisseur est requis.');
  }
  if (data.email && !validateEmail(data.email)) {
    throw new Error("L'email n'est pas valide.");
  }
  if (data.phone && !validatePhone(data.phone)) {
    throw new Error("Le numéro de téléphone n'est pas valide.");
  }

  if (isDemoMode) {
    const existing = demoDb.suppliers.find(
      (s: any) => s.tenant_id === tid && s.name.toLowerCase() === data.name.toLowerCase()
    );
    if (existing) {
      throw new Error('Un fournisseur avec ce nom existe déjà.');
    }
    if (data.tax_number) {
      const taxExists = demoDb.suppliers.find(
        (s: any) => s.tenant_id === tid && s.tax_number === data.tax_number
      );
      if (taxExists) {
        throw new Error('Ce matricule fiscal est déjà utilisé.');
      }
    }

    const newId = demoDb.suppliers.length > 0
      ? Math.max(...demoDb.suppliers.map((s: any) => s.id)) + 1
      : 1;

    const newSupplier = {
      id: newId,
      tenant_id: tid,
      name: data.name,
      company_name: data.company_name || null,
      reference: data.reference || null,
      tax_number: data.tax_number || null,
      registration_number: data.registration_number || null,
      contact_person: data.contact_person || null,
      email: data.email || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      website: data.website || null,
      address: data.address || null,
      city: data.city || null,
      postal_code: data.postal_code || null,
      country: data.country || null,
      payment_terms: data.payment_terms || null,
      payment_method: data.payment_method || null,
      currency: data.currency || 'TND',
      delivery_delay: data.delivery_delay || 0,
      minimum_order_amount: data.minimum_order_amount || 0,
      notes: data.notes || null,
      status: 'active',
      preferred: data.preferred || false,
      rating: data.rating || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
    };
    demoDb.suppliers.push(newSupplier);

    eventBus.emit(Events.SUPPLIER_CREATED, {
      tenantId: tid, id: newSupplier.id, name: newSupplier.name,
    });

    return newSupplier;
  }

  const nameCheck = await query(
    'SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
    [tid, data.name]
  );
  if (nameCheck.rows.length > 0) {
    throw new Error('Un fournisseur avec ce nom existe déjà.');
  }
  if (data.tax_number) {
    const taxCheck = await query(
      'SELECT id FROM suppliers WHERE tenant_id = $1 AND tax_number = $2',
      [tid, data.tax_number]
    );
    if (taxCheck.rows.length > 0) {
      throw new Error('Ce matricule fiscal est déjà utilisé.');
    }
  }

  const result = await query(
    `INSERT INTO suppliers (tenant_id, name, company_name, reference, tax_number, registration_number,
     contact_person, email, phone, mobile, website, address, city, postal_code, country,
     payment_terms, payment_method, currency, delivery_delay, minimum_order_amount, notes,
     status, preferred, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     RETURNING *`,
    [tid, data.name, data.company_name, data.reference, data.tax_number, data.registration_number,
     data.contact_person, data.email, data.phone, data.mobile, data.website, data.address,
     data.city, data.postal_code, data.country, data.payment_terms, data.payment_method,
     data.currency || 'TND', data.delivery_delay || 0, data.minimum_order_amount || 0,
     data.notes, 'active', data.preferred || false, data.rating || 0]
  );

  const supplier = result.rows[0];
  eventBus.emit(Events.SUPPLIER_CREATED, {
    tenantId: tid, id: supplier.id, name: supplier.name,
  });

  return supplier;
}

export async function updateSupplier(id: number, data: any, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (data.name && !data.name.trim()) {
    throw new Error('Le nom du fournisseur est requis.');
  }
  if (data.email && !validateEmail(data.email)) {
    throw new Error("L'email n'est pas valide.");
  }
  if (data.phone && !validatePhone(data.phone)) {
    throw new Error("Le numéro de téléphone n'est pas valide.");
  }

  if (isDemoMode) {
    const idx = demoDb.suppliers.findIndex((s: any) => s.id === id && s.tenant_id === tid);
    if (idx === -1) throw new Error('Fournisseur introuvable.');

    if (data.name) {
      const nameExists = demoDb.suppliers.some(
        (s: any) => s.id !== id && s.tenant_id === tid && s.name.toLowerCase() === data.name.toLowerCase()
      );
      if (nameExists) throw new Error('Un fournisseur avec ce nom existe déjà.');
    }

    const oldPreferred = demoDb.suppliers[idx].preferred;
    const updated = {
      ...demoDb.suppliers[idx],
      ...data,
      id: demoDb.suppliers[idx].id,
      tenant_id: tid,
      updated_at: new Date().toISOString(),
    };
    demoDb.suppliers[idx] = updated;

    eventBus.emit(Events.SUPPLIER_UPDATED, {
      tenantId: tid, id, name: updated.name,
    });

    if (data.preferred && !oldPreferred) {
      eventBus.emit(Events.PREFERRED_SUPPLIER_CHANGED, {
        tenantId: tid, id, name: updated.name,
      });
    }

    return updated;
  }

  if (data.name) {
    const nameCheck = await query(
      'SELECT id FROM suppliers WHERE tenant_id = $1 AND id != $2 AND LOWER(name) = LOWER($3)',
      [tid, id, data.name]
    );
    if (nameCheck.rows.length > 0) {
      throw new Error('Un fournisseur avec ce nom existe déjà.');
    }
  }

  const setClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const fields = ['name', 'company_name', 'reference', 'tax_number', 'registration_number',
    'contact_person', 'email', 'phone', 'mobile', 'website', 'address', 'city', 'postal_code',
    'country', 'payment_terms', 'payment_method', 'currency', 'delivery_delay',
    'minimum_order_amount', 'notes', 'preferred', 'rating'];
  for (const field of fields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex}`);
      params.push(data[field]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    const existing = await query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tid]);
    if (existing.rows.length === 0) throw new Error('Fournisseur introuvable.');
    return existing.rows[0];
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id, tid);
  const sql = `UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`;
  paramIndex += 2;

  const result = await query(sql, params);
  if (result.rows.length === 0) throw new Error('Fournisseur introuvable.');

  const updated = result.rows[0];

  eventBus.emit(Events.SUPPLIER_UPDATED, {
    tenantId: tid, id, name: updated.name,
  });

  if (data.preferred) {
    const oldResult = await query('SELECT preferred FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tid]);
    if (oldResult.rows.length > 0 && !oldResult.rows[0].preferred) {
      eventBus.emit(Events.PREFERRED_SUPPLIER_CHANGED, {
        tenantId: tid, id, name: updated.name,
      });
    }
  }

  return updated;
}

export async function archiveSupplier(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const supplier = demoDb.suppliers.find((s: any) => s.id === id && s.tenant_id === tid);
    if (!supplier) throw new Error('Fournisseur introuvable.');
    supplier.status = 'archived';
    supplier.archived_at = new Date().toISOString();
    supplier.updated_at = new Date().toISOString();

    eventBus.emit(Events.SUPPLIER_ARCHIVED, {
      tenantId: tid, id, name: supplier.name,
    });
    return supplier;
  }

  const result = await query(
    `UPDATE suppliers SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) throw new Error('Fournisseur introuvable.');

  eventBus.emit(Events.SUPPLIER_ARCHIVED, {
    tenantId: tid, id, name: result.rows[0].name,
  });
  return result.rows[0];
}

export async function restoreSupplier(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const supplier = demoDb.suppliers.find((s: any) => s.id === id && s.tenant_id === tid);
    if (!supplier) throw new Error('Fournisseur introuvable.');
    supplier.status = 'active';
    supplier.archived_at = null;
    supplier.updated_at = new Date().toISOString();

    eventBus.emit(Events.SUPPLIER_RESTORED, {
      tenantId: tid, id, name: supplier.name,
    });
    return supplier;
  }

  const result = await query(
    `UPDATE suppliers SET status = 'active', archived_at = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [id, tid]
  );
  if (result.rows.length === 0) throw new Error('Fournisseur introuvable.');

  eventBus.emit(Events.SUPPLIER_RESTORED, {
    tenantId: tid, id, name: result.rows[0].name,
  });
  return result.rows[0];
}

export async function deleteSupplier(
  id: number,
  tenantId?: number | null,
  callerRole?: string
): Promise<{ success: boolean; message: string; dependencies?: { ingredients: string[] } }> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (callerRole !== 'admin') {
    throw new Error('Seul un administrateur peut supprimer un fournisseur.');
  }

  if (isDemoMode) {
    const idx = demoDb.suppliers.findIndex((s: any) => s.id === id && s.tenant_id === tid);
    if (idx === -1) throw new Error('Fournisseur introuvable.');

    const linkedIngredients = demoDb.ingredients
      .filter((i: any) => i.preferred_supplier_id === id && i.tenant_id === tid)
      .map((i: any) => i.name);

    if (linkedIngredients.length > 0) {
      return {
        success: false,
        message: 'Ce fournisseur est lié à des ingrédients.',
        dependencies: { ingredients: linkedIngredients },
      };
    }

    demoDb.suppliers.splice(idx, 1);
    eventBus.emit(Events.SUPPLIER_DELETED, {
      tenantId: tid, id, name: demoDb.suppliers[idx]?.name || 'Unknown',
    });
    return { success: true, message: 'Fournisseur supprimé avec succès.' };
  }

  const ingCheck = await query(
    'SELECT name FROM ingredients WHERE preferred_supplier_id = $1 AND tenant_id = $2',
    [id, tid]
  );
  if (ingCheck.rows.length > 0) {
    return {
      success: false,
      message: 'Ce fournisseur est lié à des ingrédients.',
      dependencies: { ingredients: ingCheck.rows.map((r: any) => r.name) },
    };
  }

  const result = await query(
    'DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tid]
  );
  if (result.rows.length === 0) throw new Error('Fournisseur introuvable.');

  eventBus.emit(Events.SUPPLIER_DELETED, {
    tenantId: tid, id, name: 'Unknown',
  });
  return { success: true, message: 'Fournisseur supprimé avec succès.' };
}

export async function getSupplierIngredients(id: number, tenantId?: number | null): Promise<any[]> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    return demoDb.ingredients
      .filter((i: any) => i.preferred_supplier_id === id && i.tenant_id === tid)
      .map((i: any) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        purchase_price_per_unit: i.purchase_price_per_unit,
        alert_threshold: i.alert_threshold,
        status: i.status || 'active',
      }));
  }

  const result = await query(
    `SELECT id, name, unit, purchase_price_per_unit, alert_threshold,
            COALESCE(status, 'active') as status
     FROM ingredients WHERE preferred_supplier_id = $1 AND tenant_id = $2`,
    [id, tid]
  );
  return result.rows;
}

export async function getSupplierStats(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const supplier = demoDb.suppliers.find((s: any) => s.id === id && s.tenant_id === tid);
    if (!supplier) return null;

    const allIngredients = demoDb.ingredients.filter(
      (i: any) => i.preferred_supplier_id === id && i.tenant_id === tid
    );
    const activeIngredients = allIngredients.filter((i: any) => i.status !== 'archived');

    return {
      ingredients_count: allIngredients.length,
      active_ingredients: activeIngredients.length,
      preferred: supplier.preferred,
      rating: supplier.rating,
    };
  }

  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM ingredients WHERE preferred_supplier_id = $1 AND tenant_id = $2) as ingredients_count,
       (SELECT COUNT(*) FROM ingredients WHERE preferred_supplier_id = $1 AND tenant_id = $2 AND (status IS NULL OR status = 'active')) as active_ingredients,
       preferred, rating
     FROM suppliers WHERE id = $1 AND tenant_id = $2`,
    [id, tid]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

export async function getSupplierScore(id: number, tenantId?: number | null): Promise<any> {
  const filter = resolveTenantFilter(tenantId);
  const tid = filter ?? 1;

  if (isDemoMode) {
    const supplier = demoDb.suppliers.find((s: any) => s.id === id && s.tenant_id === tid);
    if (!supplier) return null;

    const ingredients = demoDb.ingredients.filter(
      (i: any) => i.preferred_supplier_id === id && i.tenant_id === tid
    );
    if (ingredients.length === 0) return null;

    const ingredientIds = ingredients.map((i: any) => i.id);
    const losses = demoDb.ingredient_losses.filter(
      (l: any) => ingredientIds.includes(l.ingredient_id) && l.tenant_id === tid
    );
    const purchaseMovements = demoDb.stock_movements.filter(
      (m: any) => m.type === 'purchase' && ingredientIds.includes(m.ingredient_id) && m.tenant_id === tid
    );

    const totalLossQty = losses.reduce((s: number, l: any) => s + l.quantity, 0);
    const totalLossCost = losses.reduce((s: number, l: any) => s + l.cost_loss, 0);
    const totalPurchasedQty = purchaseMovements.reduce((s: number, m: any) => s + m.quantity, 0);
    const totalPurchasedCost = purchaseMovements.reduce((s: number, m: any) => {
      const ing = ingredients.find((i: any) => i.id === m.ingredient_id);
      return s + m.quantity * (ing?.purchase_price_per_unit ?? 0);
    }, 0);

    return calculateScore(ingredients.length, losses.length, totalLossQty, totalLossCost, totalPurchasedQty, totalPurchasedCost);
  }

  const result = await query(
    `WITH supplier_ingredients AS (
       SELECT id, purchase_price_per_unit FROM ingredients
       WHERE preferred_supplier_id = $1 AND tenant_id = $2
     ),
     loss_stats AS (
       SELECT
         COALESCE(SUM(l.quantity), 0) as total_loss_qty,
         COALESCE(SUM(l.cost_loss), 0) as total_loss_cost,
         COUNT(l.id) as loss_incidents
       FROM ingredient_losses l
       JOIN supplier_ingredients si ON si.id = l.ingredient_id
       WHERE l.tenant_id = $2
     ),
     purchase_stats AS (
       SELECT
         COALESCE(SUM(sm.quantity), 0) as total_purchased_qty,
         COALESCE(SUM(sm.quantity * si.purchase_price_per_unit), 0) as total_purchased_cost
       FROM stock_movements sm
       JOIN supplier_ingredients si ON si.id = sm.ingredient_id
       WHERE sm.type = 'purchase' AND sm.tenant_id = $2
     )
     SELECT
       (SELECT COUNT(*) FROM supplier_ingredients) as ingredient_count,
       ls.*,
       ps.*
     FROM loss_stats ls, purchase_stats ps`,
    [id, tid]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (row.ingredient_count === 0) return null;

  return calculateScore(
    row.ingredient_count, row.loss_incidents,
    parseFloat(row.total_loss_qty) || 0, parseFloat(row.total_loss_cost) || 0,
    parseFloat(row.total_purchased_qty) || 0, parseFloat(row.total_purchased_cost) || 0
  );
}

function calculateScore(
  ingredientCount: number, lossIncidents: number,
  totalLossQty: number, totalLossCost: number,
  totalPurchasedQty: number, totalPurchasedCost: number
): any {
  let wasteRatioScore: number;
  if (totalPurchasedQty > 0) {
    const ratio = Math.min(totalLossQty / totalPurchasedQty, 1);
    wasteRatioScore = Math.round((1 - ratio) * 100);
  } else {
    wasteRatioScore = totalLossQty > 0 ? 0 : 100;
  }

  let frequencyScore: number;
  if (ingredientCount > 0) {
    const perIngredient = lossIncidents / ingredientCount;
    frequencyScore = Math.max(0, Math.round(100 - perIngredient * 25));
  } else {
    frequencyScore = 0;
  }

  let costImpactScore: number;
  if (totalPurchasedCost > 0) {
    const costRatio = Math.min(totalLossCost / totalPurchasedCost, 1);
    costImpactScore = Math.round((1 - costRatio) * 100);
  } else {
    costImpactScore = totalLossCost > 0 ? 0 : 100;
  }

  const finalScore = Math.round(wasteRatioScore * 0.5 + frequencyScore * 0.3 + costImpactScore * 0.2);

  return {
    score: Math.min(finalScore, 100),
    components: {
      waste_ratio: wasteRatioScore,
      frequency: frequencyScore,
      cost_impact: costImpactScore,
    },
    details: {
      ingredient_count: ingredientCount,
      loss_incidents: lossIncidents,
      total_loss_qty: parseFloat(totalLossQty.toFixed(2)),
      total_loss_cost: parseFloat(totalLossCost.toFixed(2)),
      total_purchased_qty: parseFloat(totalPurchasedQty.toFixed(2)),
      total_purchased_cost: parseFloat(totalPurchasedCost.toFixed(2)),
    },
    label: scoreLabel(finalScore),
  };
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Bon';
  if (score >= 50) return 'Moyen';
  if (score >= 25) return 'Passable';
  return 'Médiocre';
}
