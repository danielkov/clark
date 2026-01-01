/**
 * Linear Initiative Management
 *
 * Handles fetching, creating, and managing Linear Initiatives for ATS Container
 */

import { getLinearClient } from "./client";
import { Initiative } from "@linear/sdk";
import {
  storeATSContainerInitiativeId,
  getATSContainerInitiativeId,
} from "./metadata";

/**
 * Fetch all Initiatives from user's Linear workspace
 */
export async function fetchInitiatives(): Promise<Initiative[]> {
  const client = await getLinearClient();

  const initiatives = await client.initiatives();

  return initiatives.nodes;
}

/**
 * Create a new Initiative in Linear workspace
 */
export async function createInitiative(
  name: string,
  description?: string
): Promise<Initiative> {
  const client = await getLinearClient();

  const payload = await client.createInitiative({
    name,
    description,
  });

  if (!payload.success || !payload.initiative) {
    throw new Error("Failed to create Initiative");
  }

  return payload.initiative;
}

/**
 * Set an Initiative as the ATS Container
 * Stores the Initiative ID in WorkOS user metadata and updates Redis config
 */
export async function setATSContainer(initiativeId: string): Promise<void> {
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { getLinearOrgSlug } = await import("./metadata");
  const { getOrgConfig, storeOrgConfig } = await import("@/lib/redis");
  const { user } = await withAuth();

  if (!user) {
    throw new Error("No active session");
  }

  // Verify the Initiative exists
  const client = await getLinearClient();
  const initiative = await client.initiative(initiativeId);

  if (!initiative) {
    throw new Error("Initiative not found");
  }

  // Store in WorkOS metadata
  await storeATSContainerInitiativeId(user.id, initiativeId);

  // Update Redis config with the initiative ID
  const orgSlug = await getLinearOrgSlug(user.id);
  if (orgSlug) {
    const config = await getOrgConfig(orgSlug);
    if (config) {
      await storeOrgConfig(orgSlug, {
        ...config,
        atsContainerInitiativeId: initiativeId,
      });
    }
  }
}

/**
 * Get the current ATS Container Initiative ID
 */
export async function getATSContainer(): Promise<string | null> {
  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const { user } = await withAuth();

  if (!user) {
    return null;
  }

  return await getATSContainerInitiativeId(user.id);
}

/**
 * Check if user has configured an ATS Container
 */
export async function hasATSContainer(): Promise<boolean> {
  const containerId = await getATSContainer();
  return containerId !== null;
}
