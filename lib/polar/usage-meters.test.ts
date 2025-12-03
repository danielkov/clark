/**
 * Tests for usage meter tracking functions
 * 
 * These tests verify the core functionality of meter balance checking,
 * usage event recording, and unlimited tier detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkMeterBalance,
  recordUsageEvent,
  getMeterBalances,
  isUnlimitedTier,
} from './usage-meters';
import * as client from './client';
import * as redisStorage from './redis-storage';
import * as subscription from './subscription';

// Mock dependencies
vi.mock('./client');
vi.mock('./redis-storage');
vi.mock('./subscription');
vi.mock('../redis');
vi.mock('../datadog/logger');
vi.mock('../config', () => ({
  config: {
    polar: {
      accessToken: 'test-token',
      webhookSecret: 'test-secret',
      products: {
        free: 'prod_free',
        pro: 'prod_pro',
        enterprise: 'prod_enterprise',
      },
      meters: {
        jobDescriptions: 'meter_job_desc',
        candidateScreenings: 'meter_candidate',
      },
    },
  },
}));

describe('Usage Meters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isUnlimitedTier', () => {
    it('should return true for Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_enterprise',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);

      const result = await isUnlimitedTier('org-123');
      expect(result).toBe(true);
    });

    it('should return false for non-Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);

      const result = await isUnlimitedTier('org-123');
      expect(result).toBe(false);
    });

    it('should return false when no subscription exists', async () => {
      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(null);

      const result = await isUnlimitedTier('org-123');
      expect(result).toBe(false);
    });
  });

  describe('checkMeterBalance', () => {
    it('should return unlimited for Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_enterprise',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);

      const result = await checkMeterBalance('org-123', 'job_descriptions');

      expect(result.allowed).toBe(true);
      expect(result.unlimited).toBe(true);
      expect(result.balance).toBe(Infinity);
      expect(result.limit).toBe(null);
    });

    it('should check balance for non-Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      const mockCustomerState = {
        activeMeters: [
          {
            id: 'meter-1',
            meterId: 'meter_job_desc',
            consumedUnits: 5,
            creditedUnits: 50,
            balance: 45,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        ],
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);
      vi.mocked(client.getCustomerState).mockResolvedValue(mockCustomerState as any);

      const result = await checkMeterBalance('org-123', 'job_descriptions');

      expect(result.allowed).toBe(true);
      expect(result.unlimited).toBe(false);
      expect(result.balance).toBe(45);
      expect(result.limit).toBe(50);
    });

    it('should return not allowed when balance is zero', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      const mockCustomerState = {
        activeMeters: [
          {
            id: 'meter-1',
            meterId: 'meter_job_desc',
            consumedUnits: 50,
            creditedUnits: 50,
            balance: 0,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        ],
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);
      vi.mocked(client.getCustomerState).mockResolvedValue(mockCustomerState as any);

      const result = await checkMeterBalance('org-123', 'job_descriptions');

      expect(result.allowed).toBe(false);
      expect(result.balance).toBe(0);
    });
  });

  describe('recordUsageEvent', () => {
    it('should record job description event', async () => {
      vi.mocked(client.ingestUsageEvents).mockResolvedValue({
        inserted: 1,
        duplicates: 0,
      });

      await recordUsageEvent('org-123', 'job_descriptions', {
        userId: 'user-1',
        resourceId: 'project-1',
      });

      expect(client.ingestUsageEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'job_description_generated',
          externalCustomerId: 'org-123',
          metadata: expect.objectContaining({
            meterName: 'job_descriptions',
            userId: 'user-1',
            resourceId: 'project-1',
          }),
        }),
      ]);
    });

    it('should record candidate screening event', async () => {
      vi.mocked(client.ingestUsageEvents).mockResolvedValue({
        inserted: 1,
        duplicates: 0,
      });

      await recordUsageEvent('org-123', 'candidate_screenings', {
        userId: 'user-2',
        resourceId: 'issue-1',
      });

      expect(client.ingestUsageEvents).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'candidate_screened',
          externalCustomerId: 'org-123',
          metadata: expect.objectContaining({
            meterName: 'candidate_screenings',
            userId: 'user-2',
            resourceId: 'issue-1',
          }),
        }),
      ]);
    });

    it('should queue failed events for retry', async () => {
      vi.mocked(client.ingestUsageEvents).mockRejectedValue(new Error('API error'));
      vi.mocked(redisStorage.queueFailedEvent).mockResolvedValue();

      await recordUsageEvent('org-123', 'job_descriptions', {
        userId: 'user-1',
        resourceId: 'project-1',
      });

      expect(redisStorage.queueFailedEvent).toHaveBeenCalledWith(
        'org-123',
        expect.objectContaining({
          name: 'job_description_generated',
          externalCustomerId: 'org-123',
        })
      );
    });
  });

  describe('getMeterBalances', () => {
    it('should return unlimited balances for Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_enterprise',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);

      const result = await getMeterBalances('org-123');

      expect(result).toHaveLength(2);
      expect(result[0].unlimited).toBe(true);
      expect(result[1].unlimited).toBe(true);
      expect(result[0].balance).toBe(Infinity);
      expect(result[1].balance).toBe(Infinity);
    });

    it('should return actual balances for non-Enterprise tier', async () => {
      const mockSubscription = {
        linearOrgId: 'org-123',
        polarCustomerId: 'cus-123',
        productId: 'prod_pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      };

      const mockCustomerState = {
        activeMeters: [
          {
            id: 'meter-1',
            meterId: 'meter_job_desc',
            consumedUnits: 5,
            creditedUnits: 50,
            balance: 45,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
          {
            id: 'meter-2',
            meterId: 'meter_candidate',
            consumedUnits: 100,
            creditedUnits: 500,
            balance: 400,
            createdAt: new Date(),
            modifiedAt: new Date(),
          },
        ],
      };

      vi.mocked(redisStorage.retrieveSubscription).mockResolvedValue(mockSubscription);
      vi.mocked(subscription.getTiers).mockReturnValue([
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 19900,
          currency: 'usd',
          allowances: { jobDescriptions: null, candidateScreenings: null },
          polarProductId: 'prod_enterprise',
          description: 'Enterprise tier',
          features: [],
        },
      ] as any);
      vi.mocked(client.getCustomerState).mockResolvedValue(mockCustomerState as any);

      const result = await getMeterBalances('org-123');

      expect(result).toHaveLength(2);
      expect(result[0].meterName).toBe('job_descriptions');
      expect(result[0].balance).toBe(45);
      expect(result[0].unlimited).toBe(false);
      expect(result[1].meterName).toBe('candidate_screenings');
      expect(result[1].balance).toBe(400);
      expect(result[1].unlimited).toBe(false);
    });
  });
});
