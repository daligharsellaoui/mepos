# Skill: API Endpoint Development

## Purpose
Add new API endpoints to the mePOS STOCK Express backend.

## File Structure

```
backend/src/
├── services/
│   └── myFeature.service.ts    # Business logic
├── routes/
│   └── myFeature.ts            # Route handlers (thin)
└── index.ts                    # Mount the router
```

## Step 1: Create the Service

```typescript
// backend/src/services/myFeature.service.ts
import { query, isDemoMode, demoDb } from '../database'

export class MyFeatureService {
  // Get all items
  static async getAll() {
    if (isDemoMode) {
      return demoDb.myFeatures || []
    }
    const result = await query('SELECT * FROM my_features ORDER BY id')
    return result.rows
  }

  // Get by ID
  static async getById(id: number) {
    if (isDemoMode) {
      return (demoDb.myFeatures || []).find((f: any) => f.id === id)
    }
    const result = await query('SELECT * FROM my_features WHERE id = $1', [id])
    return result.rows[0]
  }

  // Create
  static async create(data: { name: string; description?: string }) {
    if (isDemoMode) {
      const item = { id: Date.now(), ...data, created_at: new Date() }
      demoDb.myFeatures = [...(demoDb.myFeatures || []), item]
      return item
    }
    const result = await query(
      'INSERT INTO my_features (name, description) VALUES ($1, $2) RETURNING *',
      [data.name, data.description]
    )
    return result.rows[0]
  }

  // Update
  static async update(id: number, data: { name?: string; description?: string }) {
    if (isDemoMode) {
      const features = demoDb.myFeatures || []
      const idx = features.findIndex((f: any) => f.id === id)
      if (idx >= 0) features[idx] = { ...features[idx], ...data }
      return features[idx]
    }
    const fields: string[] = []
    const values: any[] = []
    let paramIdx = 1

    if (data.name !== undefined) {
      fields.push(`name = $${paramIdx++}`)
      values.push(data.name)
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIdx++}`)
      values.push(data.description)
    }

    if (fields.length === 0) return null
    values.push(id)

    const result = await query(
      `UPDATE my_features SET ${fields.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    )
    return result.rows[0]
  }

  // Delete
  static async delete(id: number) {
    if (isDemoMode) {
      demoDb.myFeatures = (demoDb.myFeatures || []).filter((f: any) => f.id !== id)
      return true
    }
    await query('DELETE FROM my_features WHERE id = $1', [id])
    return true
  }
}
```

## Step 2: Create the Route

```typescript
// backend/src/routes/myFeature.ts
import { Router, Request, Response } from 'express'
import { MyFeatureService } from '../services/myFeature.service'
import { authMiddleware } from './auth'

const router = Router()

// Apply auth to all routes
router.use(authMiddleware)

// GET /api/v1/my-features
router.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await MyFeatureService.getAll()
    res.json({ status: 'success', data: items })
  } catch (err: any) {
    console.error('[MyFeature] GET error:', err)
    res.status(500).json({ status: 'error', message: err.message })
  }
})

// GET /api/v1/my-features/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await MyFeatureService.getById(parseInt(req.params.id))
    if (!item) {
      return res.status(404).json({ status: 'error', message: 'Not found' })
    }
    res.json({ status: 'success', data: item })
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message })
  }
})

// POST /api/v1/my-features
router.post('/', async (req: Request, res: Response) => {
  try {
    const item = await MyFeatureService.create(req.body)
    res.status(201).json({ status: 'success', data: item })
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err.message })
  }
})

// PUT /api/v1/my-features/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const item = await MyFeatureService.update(parseInt(req.params.id), req.body)
    res.json({ status: 'success', data: item })
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err.message })
  }
})

// DELETE /api/v1/my-features/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await MyFeatureService.delete(parseInt(req.params.id))
    res.json({ status: 'success', message: 'Deleted' })
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message })
  }
})

export default router
```

## Step 3: Mount in index.ts

```typescript
// backend/src/index.ts
import myFeatureRouter from './routes/myFeature'

// Add after existing route mounts
app.use('/api/v1/my-features', myFeatureRouter)
```

## Step 4: Add Frontend API Method

```javascript
// frontend/src/api/index.js
export const api = {
  // ... existing methods ...

  // My Feature
  getMyFeatures: () => client.get('/my-features'),
  getMyFeature: (id) => client.get(`/my-features/${id}`),
  createMyFeature: (data) => client.post('/my-features', data),
  updateMyFeature: (id, data) => client.put(`/my-features/${id}`, data),
  deleteMyFeature: (id) => client.delete(`/my-features/${id}`),
}
```

## Step 5: Add Database Table (if PostgreSQL)

```sql
-- Add to schema.ts or run manually
CREATE TABLE IF NOT EXISTS my_features (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Response Format

All endpoints must return:
```json
{
  "status": "success" | "error",
  "data": { ... },
  "message": "Error message (only on error)"
}
```

## Authentication

- `authMiddleware` for JWT-protected routes
- `authLimiter` for auth routes (rate limiting)
- API key for POS sync agent routes
