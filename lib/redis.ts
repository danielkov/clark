/**
 * Upstash Redis Client
 * 
 * Manages Redis connections and operations for storing Linear org configuration
 */

import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Linear organization configuration stored in Redis
 */
export interface LinearOrgConfig {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  orgId: string;
  orgName: string;
  atsContainerInitiativeId: string;
}

/**
 * Store Linear organization configuration in Redis
 * Key format: linear:org:{orgName}:config
 */
export async function storeOrgConfig(orgName: string, config: LinearOrgConfig): Promise<void> {
  const key = `linear:org:${orgName}:config`;
  await redis.set(key, config);
}

/**
 * Get Linear organization configuration from Redis
 */
export async function getOrgConfig(orgName: string): Promise<LinearOrgConfig | null> {
  console.log('[getOrgConfig] Starting for org:', orgName);
  const key = `linear:org:${orgName}:config`;
  console.log('[getOrgConfig] About to call redis.get with key:', key);
  const res = await redis.get<LinearOrgConfig>(key)
  console.log('[getOrgConfig] redis.get returned:', res ? 'config found' : 'null');
  return res;
}

/**
 * Check if organization config exists in Redis
 */
export async function hasOrgConfig(orgName: string): Promise<boolean> {
  const config = await getOrgConfig(orgName);
  return config !== null;
}

/**
 * Delete organization config from Redis
 */
export async function deleteOrgConfig(orgName: string): Promise<void> {
  const key = `linear:org:${orgName}:config`;
  await redis.del(key);
}

// Legacy functions for backward compatibility - deprecated
/**
 * @deprecated Use storeOrgConfig instead
 */
export async function storeOrgToken(orgId: string, accessToken: string): Promise<void> {
  const key = `linear:org:${orgId}:token`;
  await redis.set(key, accessToken);
}

/**
 * @deprecated Use getOrgConfig instead
 */
export async function getOrgToken(orgId: string): Promise<string | null> {
  const key = `linear:org:${orgId}:token`;
  const res = await redis.get<string>(key)
  return res;
}

/**
 * @deprecated Use hasOrgConfig instead
 */
export async function hasOrgToken(orgId: string): Promise<boolean> {
  const token = await getOrgToken(orgId);
  return token !== null;
}

/**
 * @deprecated Use deleteOrgConfig instead
 */
export async function deleteOrgToken(orgId: string): Promise<void> {
  const key = `linear:org:${orgId}:token`;
  await redis.del(key);
}

export { redis };
