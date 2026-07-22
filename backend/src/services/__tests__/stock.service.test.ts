import { describe, it, expect, beforeAll } from 'vitest';
import { Decimal } from 'decimal.js';
import { demoDb } from '../../database';
import {
  getEffectiveDepartmentId,
  ensureStockRow,
  getStockQuantity,
  updateStockQuantity,
  calculateLossCosts,
} from '../stock.service';

describe('Stock Service (Demo Mode)', () => {
  // Department IDs from seed: 1=Dépôt Central, 2=Cuisine, 3=Chambre Froide
  // Ingredient IDs from seed: 1=Viande Hachée Bœuf, 2=Blanc de Poulet, 4=Fromage Cheddar

  describe('getEffectiveDepartmentId', () => {
    it('should return same ID for isolated department', async () => {
      const deptId = await getEffectiveDepartmentId(1); // Dépôt Central = isolated
      expect(deptId).toBe(1);
    });

    it('should return the same ID for any department (all are isolated in seed)', async () => {
      const deptId = await getEffectiveDepartmentId(2); // Cuisine = isolated
      expect(deptId).toBe(2);
    });
  });

  describe('ensureStockRow', () => {
    it('should create a stock row if it does not exist', async () => {
      // Use a non-existent ingredient ID
      const nonExistentIngredientId = 9999;
      await ensureStockRow(null, 1, nonExistentIngredientId);

      const qty = await getStockQuantity(1, nonExistentIngredientId);
      expect(qty.toNumber()).toBe(0);
    });
  });

  describe('getStockQuantity', () => {
    it('should return positive quantity for seeded stock', async () => {
      const qty = await getStockQuantity(1, 1); // Dépôt Central, Farine
      expect(qty.toNumber()).toBeGreaterThan(0);
    });

    it('should return 0 for non-existent stock', async () => {
      const qty = await getStockQuantity(1, 99999);
      expect(qty.toNumber()).toBe(0);
    });
  });

  describe('updateStockQuantity', () => {
    it('should deduct stock correctly', async () => {
      const before = await getStockQuantity(1, 2); // Mozzarella in Central
      const deducted = new Decimal(-5);
      const after = await updateStockQuantity(null, 1, 2, deducted);

      expect(after.toNumber()).toBeCloseTo(before.toNumber() - 5, 4);
    });

    it('should not go below zero', async () => {
      const qty = await getStockQuantity(2, 4); // Cuisine, Steak = 30
      const bigDeduct = new Decimal(-9999);
      const result = await updateStockQuantity(null, 2, 4, bigDeduct);

      expect(result.toNumber()).toBe(0);
    });
  });

  describe('calculateLossCosts', () => {
    it('should calculate cost and opportunity loss for an ingredient', async () => {
      const { costLoss, opportunityLoss } = await calculateLossCosts(1, new Decimal(1)); // 1kg Viande Hachée Bœuf

      // Viande Hachée Bœuf purchase_price_per_unit = 18.50
      expect(costLoss.toNumber()).toBeCloseTo(18.50, 2);
      // Opportunity loss should be positive (Viande Hachée Bœuf is in recipes)
      expect(opportunityLoss.toNumber()).toBeGreaterThan(0);
    });

    it('should return 0 opportunity loss for unused ingredient', async () => {
      const { costLoss, opportunityLoss } = await calculateLossCosts(13, new Decimal(1)); // Moutarde

      // Moutarde purchase_price_per_unit = 7.00
      expect(costLoss.toNumber()).toBeCloseTo(7.00, 2);
      // Moutarde is not used in any recipe
      expect(opportunityLoss.toNumber()).toBe(0);
    });

    it('should scale loss with quantity', async () => {
      const single = await calculateLossCosts(2, new Decimal(1)); // 1kg Blanc de Poulet
      const double = await calculateLossCosts(2, new Decimal(2)); // 2kg Blanc de Poulet

      expect(double.costLoss.toNumber()).toBeCloseTo(single.costLoss.toNumber() * 2, 2);
    });
  });
});
