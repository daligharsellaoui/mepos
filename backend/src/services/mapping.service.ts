import { query, getClient, isDemoMode, demoDb } from '../database';
import { eventBus, Events } from './event.service';

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score between two strings (0-100)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 100;

  const distance = levenshteinDistance(s1, s2);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Get all mappings with optional filters
 */
export async function getMappings(
  tenantId: number,
  options: {
    connectorType?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ data: any[]; total: number }> {
  const { connectorType, status, search, limit = 50, offset = 0 } = options;

  if (isDemoMode) {
    let mappings = (demoDb as any).product_mappings || [];
    mappings = mappings.filter((m: any) => m.tenant_id === tenantId);

    if (connectorType) {
      mappings = mappings.filter((m: any) => m.connector_type === connectorType);
    }
    if (status) {
      mappings = mappings.filter((m: any) => m.mapping_status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      mappings = mappings.filter((m: any) =>
        m.external_product_name?.toLowerCase().includes(q) ||
        m.external_product_code?.toLowerCase().includes(q)
      );
    }

    const total = mappings.length;
    const data = mappings.slice(offset, offset + limit);
    return { data, total };
  }

  let sql = `
    SELECT pm.*, r.name as mepos_product_name, r.sale_price as mepos_product_price
    FROM product_mappings pm
    LEFT JOIN recipes r ON pm.mepos_product_id = r.id AND r.tenant_id = pm.tenant_id
    WHERE pm.tenant_id = $1
  `;
  const params: any[] = [tenantId];
  let paramIdx = 2;

  if (connectorType) {
    sql += ` AND pm.connector_type = $${paramIdx++}`;
    params.push(connectorType);
  }
  if (status) {
    sql += ` AND pm.mapping_status = $${paramIdx++}`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (pm.external_product_name ILIKE $${paramIdx} OR pm.external_product_code ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  sql += ` ORDER BY pm.created_at DESC`;
  sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(limit, offset);

  const result = await query(sql, params);

  const countSql = `SELECT COUNT(*) FROM product_mappings WHERE tenant_id = $1`;
  const countResult = await query(countSql, [tenantId]);

  return {
    data: result.rows,
    total: parseInt(countResult.rows[0]?.count || '0', 10)
  };
}

/**
 * Get a single mapping by ID
 */
export async function getMappingById(id: number, tenantId: number): Promise<any | null> {
  if (isDemoMode) {
    return ((demoDb as any).product_mappings || []).find(
      (m: any) => m.id === id && m.tenant_id === tenantId
    ) || null;
  }

  const result = await query(
    `SELECT pm.*, r.name as mepos_product_name, r.sale_price as mepos_product_price
     FROM product_mappings pm
     LEFT JOIN recipes r ON pm.mepos_product_id = r.id AND r.tenant_id = pm.tenant_id
     WHERE pm.id = $1 AND pm.tenant_id = $2`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new mapping
 */
export async function createMapping(
  tenantId: number,
  data: {
    connector_type: string;
    external_product_id: string;
    external_product_code?: string;
    external_product_name?: string;
    mepos_product_id?: number;
    mapping_status?: string;
    confidence?: number;
  }
): Promise<any> {
  const {
    connector_type,
    external_product_id,
    external_product_code,
    external_product_name,
    mepos_product_id,
    mapping_status = 'unmapped',
    confidence = 0
  } = data;

  if (isDemoMode) {
    const existing = ((demoDb as any).product_mappings || []).find(
      (m: any) =>
        m.tenant_id === tenantId &&
        m.connector_type === connector_type &&
        m.external_product_id === external_product_id
    );

    if (existing) {
      throw new Error('Ce mapping existe déjà');
    }

    const newMapping = {
      id: ((demoDb as any).product_mappings || []).length + 1,
      tenant_id: tenantId,
      connector_type,
      external_product_id,
      external_product_code: external_product_code || null,
      external_product_name: external_product_name || null,
      mepos_product_id: mepos_product_id || null,
      mapping_status,
      confidence,
      created_at: new Date(),
      updated_at: new Date()
    };

    if (!(demoDb as any).product_mappings) (demoDb as any).product_mappings = [];
    (demoDb as any).product_mappings.push(newMapping);

    eventBus.emit(Events.MAPPING_CREATED, { tenantId, mapping: newMapping });
    return newMapping;
  }

  const result = await query(
    `INSERT INTO product_mappings (tenant_id, connector_type, external_product_id, external_product_code, external_product_name, mepos_product_id, mapping_status, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, connector_type, external_product_id, external_product_code || null, external_product_name || null, mepos_product_id || null, mapping_status, confidence]
  );

  const mapping = result.rows[0];
  eventBus.emit(Events.MAPPING_CREATED, { tenantId, mapping });
  return mapping;
}

/**
 * Update a mapping
 */
export async function updateMapping(
  id: number,
  tenantId: number,
  data: {
    mepos_product_id?: number;
    mapping_status?: string;
    confidence?: number;
  }
): Promise<any | null> {
  const { mepos_product_id, mapping_status, confidence } = data;

  if (isDemoMode) {
    const mapping = ((demoDb as any).product_mappings || []).find(
      (m: any) => m.id === id && m.tenant_id === tenantId
    );
    if (!mapping) return null;

    if (mepos_product_id !== undefined) mapping.mepos_product_id = mepos_product_id;
    if (mapping_status !== undefined) mapping.mapping_status = mapping_status;
    if (confidence !== undefined) mapping.confidence = confidence;
    mapping.updated_at = new Date();

    eventBus.emit(Events.MAPPING_UPDATED, { tenantId, mapping });
    return mapping;
  }

  const fields: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (mepos_product_id !== undefined) {
    fields.push(`mepos_product_id = $${paramIdx++}`);
    params.push(mepos_product_id);
  }
  if (mapping_status !== undefined) {
    fields.push(`mapping_status = $${paramIdx++}`);
    params.push(mapping_status);
  }
  if (confidence !== undefined) {
    fields.push(`confidence = $${paramIdx++}`);
    params.push(confidence);
  }

  if (fields.length === 0) return null;

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id, tenantId);

  const result = await query(
    `UPDATE product_mappings SET ${fields.join(', ')}
     WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx}
     RETURNING *`,
    params
  );

  const mapping = result.rows[0];
  if (mapping) {
    eventBus.emit(Events.MAPPING_UPDATED, { tenantId, mapping });
  }
  return mapping || null;
}

/**
 * Delete a mapping
 */
export async function deleteMapping(id: number, tenantId: number): Promise<boolean> {
  if (isDemoMode) {
    const idx = ((demoDb as any).product_mappings || []).findIndex(
      (m: any) => m.id === id && m.tenant_id === tenantId
    );
    if (idx === -1) return false;

    const mapping = (demoDb as any).product_mappings[idx];
    (demoDb as any).product_mappings.splice(idx, 1);
    eventBus.emit(Events.MAPPING_DELETED, { tenantId, mappingId: id });
    return true;
  }

  const result = await query(
    'DELETE FROM product_mappings WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  if (result.rows.length > 0) {
    eventBus.emit(Events.MAPPING_DELETED, { tenantId, mappingId: id });
    return true;
  }
  return false;
}

/**
 * Bulk create/update mappings
 */
export async function bulkMap(
  tenantId: number,
  mappings: Array<{
    external_product_id: string;
    mepos_product_id: number;
    connector_type?: string;
  }>
): Promise<{ created: number; updated: number; errors: string[] }> {
  const stats = { created: 0, updated: 0, errors: [] as string[] };

  if (isDemoMode) {
    for (const m of mappings) {
      try {
        const existing = ((demoDb as any).product_mappings || []).find(
          (pm: any) =>
            pm.tenant_id === tenantId &&
            pm.external_product_id === m.external_product_id
        );

        if (existing) {
          existing.mepos_product_id = m.mepos_product_id;
          existing.mapping_status = 'mapped';
          existing.confidence = 100;
          existing.updated_at = new Date();
          stats.updated++;
        } else {
          await createMapping(tenantId, {
            connector_type: m.connector_type || 'pos',
            external_product_id: m.external_product_id,
            mepos_product_id: m.mepos_product_id,
            mapping_status: 'mapped',
            confidence: 100
          });
          stats.created++;
        }
      } catch (error: any) {
        stats.errors.push(`Error mapping ${m.external_product_id}: ${error.message}`);
      }
    }
    return stats;
  }

  const { client, release } = await getClient();
  try {
    await client.query('BEGIN');

    for (const m of mappings) {
      try {
        const existing = await client.query(
          'SELECT id FROM product_mappings WHERE tenant_id = $1 AND external_product_id = $2',
          [tenantId, m.external_product_id]
        );

        if (existing.rows.length > 0) {
          await client.query(
            'UPDATE product_mappings SET mepos_product_id = $1, mapping_status = $2, confidence = 100, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [m.mepos_product_id, 'mapped', existing.rows[0].id]
          );
          stats.updated++;
        } else {
          await client.query(
            `INSERT INTO product_mappings (tenant_id, connector_type, external_product_id, mepos_product_id, mapping_status, confidence)
             VALUES ($1, $2, $3, $4, 'mapped', 100)`,
            [tenantId, m.connector_type || 'pos', m.external_product_id, m.mepos_product_id]
          );
          stats.created++;
        }
      } catch (error: any) {
        stats.errors.push(`Error mapping ${m.external_product_id}: ${error.message}`);
      }
    }

    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    stats.errors.push(`Transaction error: ${error.message}`);
  } finally {
    release();
  }

  return stats;
}

/**
 * Auto-match external products to recipes using fuzzy matching
 */
export async function autoMatch(
  tenantId: number,
  connectorType: string,
  threshold: number = 60
): Promise<{ matched: number; suggestions: any[] }> {
  const suggestions: any[] = [];
  let matched = 0;

  // Get unmapped external products
  const { data: unmapped } = await getMappings(tenantId, {
    connectorType,
    status: 'unmapped',
    limit: 1000
  });

  // Get all recipes
  let recipes: any[] = [];
  if (isDemoMode) {
    recipes = (demoDb.recipes || []).filter((r: any) => r.tenant_id === tenantId);
  } else {
    const result = await query(
      'SELECT id, name FROM recipes WHERE tenant_id = $1',
      [tenantId]
    );
    recipes = result.rows;
  }

  for (const mapping of unmapped) {
    let bestMatch: any = null;
    let bestScore = 0;

    for (const recipe of recipes) {
      const score = calculateSimilarity(
        mapping.external_product_name || '',
        recipe.name
      );

      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = recipe;
      }
    }

    if (bestMatch) {
      suggestions.push({
        mapping_id: mapping.id,
        external_product_name: mapping.external_product_name,
        matched_recipe: bestMatch.name,
        matched_recipe_id: bestMatch.id,
        confidence: bestScore
      });
      matched++;
    }
  }

  eventBus.emit(Events.MAPPING_AUTO_MATCHED, {
    tenantId,
    connectorType,
    matched,
    total: unmapped.length
  });

  return { matched, suggestions };
}

/**
 * Get mapping statistics
 */
export async function getMappingStats(tenantId: number): Promise<any> {
  if (isDemoMode) {
    const mappings = ((demoDb as any).product_mappings || []).filter(
      (m: any) => m.tenant_id === tenantId
    );

    return {
      total: mappings.length,
      mapped: mappings.filter((m: any) => m.mapping_status === 'mapped').length,
      unmapped: mappings.filter((m: any) => m.mapping_status === 'unmapped').length,
      ignored: mappings.filter((m: any) => m.mapping_status === 'ignored').length,
      completionPercentage: mappings.length > 0
        ? Math.round((mappings.filter((m: any) => m.mapping_status === 'mapped').length / mappings.length) * 100)
        : 0
    };
  }

  const result = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE mapping_status = 'mapped') as mapped,
       COUNT(*) FILTER (WHERE mapping_status = 'unmapped') as unmapped,
       COUNT(*) FILTER (WHERE mapping_status = 'ignored') as ignored,
       ROUND(
         COUNT(*) FILTER (WHERE mapping_status = 'mapped')::DECIMAL /
         NULLIF(COUNT(*), 0) * 100, 0
       ) as completion_percentage
     FROM product_mappings
     WHERE tenant_id = $1`,
    [tenantId]
  );

  const row = result.rows[0];
  return {
    total: parseInt(row.total, 10),
    mapped: parseInt(row.mapped, 10),
    unmapped: parseInt(row.unmapped, 10),
    ignored: parseInt(row.ignored, 10),
    completionPercentage: parseInt(row.completion_percentage || '0', 10)
  };
}

/**
 * Get unmapped products list
 */
export async function getUnmappedProducts(tenantId: number, limit: number = 100): Promise<any[]> {
  const { data } = await getMappings(tenantId, { status: 'unmapped', limit });
  return data;
}

/**
 * Validate mappings completeness
 */
export async function validateMappings(tenantId: number): Promise<{
  valid: boolean;
  completionPercentage: number;
  missing: any[];
}> {
  const stats = await getMappingStats(tenantId);

  let missing: any[] = [];
  if (stats.unmapped > 0) {
    const unmapped = await getUnmappedProducts(tenantId, 50);
    missing = unmapped.map((m: any) => ({
      external_product_id: m.external_product_id,
      external_product_name: m.external_product_name
    }));
  }

  return {
    valid: stats.completionPercentage === 100,
    completionPercentage: stats.completionPercentage,
    missing
  };
}

/**
 * Resolve external_product_id to mepos_product_id via product_mappings
 * Returns null if no mapping found or mapping is unmapped/ignored
 */
export async function resolveExternalProductId(
  tenantId: number,
  connectorType: string,
  externalProductId: string
): Promise<{ mepos_product_id: number | null; mapping_status: string; mapping_id: number | null }> {
  if (isDemoMode) {
    const mapping = ((demoDb as any).product_mappings || []).find(
      (m: any) =>
        m.tenant_id === tenantId &&
        m.connector_type === connectorType &&
        m.external_product_id === externalProductId
    );

    if (!mapping) {
      return { mepos_product_id: null, mapping_status: 'unmapped', mapping_id: null };
    }

    return {
      mepos_product_id: mapping.mapping_status === 'mapped' ? mapping.mepos_product_id : null,
      mapping_status: mapping.mapping_status,
      mapping_id: mapping.id
    };
  }

  const result = await query(
    `SELECT id, mepos_product_id, mapping_status
     FROM product_mappings
     WHERE tenant_id = $1 AND connector_type = $2 AND external_product_id = $3`,
    [tenantId, connectorType, externalProductId]
  );

  if (result.rows.length === 0) {
    return { mepos_product_id: null, mapping_status: 'unmapped', mapping_id: null };
  }

  const mapping = result.rows[0];
  return {
    mepos_product_id: mapping.mapping_status === 'mapped' ? mapping.mepos_product_id : null,
    mapping_status: mapping.mapping_status,
    mapping_id: mapping.id
  };
}

/**
 * Bulk resolve external_product_ids to mepos_product_ids
 */
export async function resolveExternalProductIds(
  tenantId: number,
  connectorType: string,
  externalProductIds: string[]
): Promise<Map<string, { mepos_product_id: number | null; mapping_status: string; mapping_id: number | null }>> {
  const results = new Map<string, { mepos_product_id: number | null; mapping_status: string; mapping_id: number | null }>();

  if (isDemoMode) {
    for (const extId of externalProductIds) {
      const result = await resolveExternalProductId(tenantId, connectorType, extId);
      results.set(extId, result);
    }
    return results;
  }

  const result = await query(
    `SELECT external_product_id, id, mepos_product_id, mapping_status
     FROM product_mappings
     WHERE tenant_id = $1 AND connector_type = $2 AND external_product_id = ANY($3)`,
    [tenantId, connectorType, externalProductIds]
  );

  // Initialize all as unmapped
  for (const extId of externalProductIds) {
    results.set(extId, { mepos_product_id: null, mapping_status: 'unmapped', mapping_id: null });
  }

  // Fill in found mappings
  for (const row of result.rows) {
    results.set(row.external_product_id, {
      mepos_product_id: row.mapping_status === 'mapped' ? row.mepos_product_id : null,
      mapping_status: row.mapping_status,
      mapping_id: row.id
    });
  }

  return results;
}

/**
 * Import external POS products
 */
export async function importPosProducts(
  tenantId: number,
  connectorType: string,
  products: Array<{
    external_id: string;
    code?: string;
    name: string;
  }>
): Promise<{ imported: number; duplicates: number; errors: string[] }> {
  const stats = { imported: 0, duplicates: 0, errors: [] as string[] };

  for (const product of products) {
    try {
      await createMapping(tenantId, {
        connector_type: connectorType,
        external_product_id: product.external_id,
        external_product_code: product.code,
        external_product_name: product.name,
        mapping_status: 'unmapped',
        confidence: 0
      });
      stats.imported++;
    } catch (error: any) {
      if (error.message.includes('existe déjà')) {
        stats.duplicates++;
      } else {
        stats.errors.push(`Error importing ${product.external_id}: ${error.message}`);
      }
    }
  }

  return stats;
}
