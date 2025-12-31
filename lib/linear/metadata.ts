/**
 * Linear Organization Management via WorkOS User Metadata
 *
 * Stores Linear org slug in WorkOS user metadata. Tokens are stored in Redis only.
 * Reference: https://workos.com/docs/authkit/metadata/exposing-metadata-in-jwts
 */

import { WorkOS } from "@workos-inc/node";
import { config } from "../config";

const workos = new WorkOS(config.workos.apiKey);

/**
 * Store Linear org slug in WorkOS user metadata
 */
export async function storeLinearOrgSlug(
  userId: string,
  orgSlug: string
): Promise<void> {
  try {
    await workos.userManagement.updateUser({
      userId,
      metadata: {
        linearOrgSlug: orgSlug,
      },
    });
  } catch (error) {
    console.error("Failed to store Linear org slug in WorkOS metadata:", error);
    throw new Error("Failed to save Linear organization");
  }
}

/**
 * Get Linear org slug from WorkOS user metadata
 */
export async function getLinearOrgSlug(userId: string): Promise<string | null> {
  try {
    const user = await workos.userManagement.getUser(userId);

    const metadata = user.metadata as Record<string, unknown>;

    if (!metadata?.linearOrgSlug) {
      return null;
    }

    return metadata.linearOrgSlug as string;
  } catch (error) {
    console.error(
      "Failed to retrieve Linear org slug from WorkOS metadata:",
      error
    );
    return null;
  }
}

/**
 * Remove Linear org slug from WorkOS user metadata
 */
export async function removeLinearOrgSlug(userId: string): Promise<void> {
  try {
    await workos.userManagement.updateUser({
      userId,
      metadata: {
        linearOrgSlug: null,
      },
    });
  } catch (error) {
    console.error(
      "Failed to remove Linear org slug from WorkOS metadata:",
      error
    );
    throw new Error("Failed to disconnect Linear");
  }
}

/**
 * Store ATS Container Initiative ID in WorkOS user metadata
 */
export async function storeATSContainerInitiativeId(
  userId: string,
  initiativeId: string
): Promise<void> {
  try {
    await workos.userManagement.updateUser({
      userId,
      metadata: {
        atsContainerInitiativeId: initiativeId,
      },
    });
  } catch (error) {
    console.error(
      "Failed to store ATS Container Initiative ID in WorkOS metadata:",
      error
    );
    throw new Error("Failed to save ATS Container configuration");
  }
}

/**
 * Get ATS Container Initiative ID from WorkOS user metadata
 */
export async function getATSContainerInitiativeId(
  userId: string
): Promise<string | null> {
  try {
    const user = await workos.userManagement.getUser(userId);

    const metadata = user.metadata as Record<string, unknown>;

    if (!metadata?.atsContainerInitiativeId) {
      return null;
    }

    return metadata.atsContainerInitiativeId as string;
  } catch (error) {
    console.error(
      "Failed to retrieve ATS Container Initiative ID from WorkOS metadata:",
      error
    );
    return null;
  }
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Store organization config in Redis and org slug in WorkOS metadata
 */
export async function storeOrgConfigInRedis(
  userId: string,
  tokens: OAuthTokens
): Promise<string> {
  const { LinearClient } = await import("@linear/sdk");
  const { storeOrgConfig } = await import("@/lib/redis");
  const { logger } = await import("@/lib/datadog/logger");

  const linearClient = new LinearClient({ accessToken: tokens.accessToken });
  const organization = await linearClient.organization;

  // Get ATS container initiative ID if it exists
  const atsContainerInitiativeId =
    (await getATSContainerInitiativeId(userId)) || "";

  // Store org config in Redis using urlKey (slug) as the key
  await storeOrgConfig(organization.urlKey, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    orgId: organization.id,
    orgName: organization.name,
    atsContainerInitiativeId,
  });

  // Store org slug in WorkOS user metadata
  await storeLinearOrgSlug(userId, organization.urlKey);

  logger.info("Linear organization config stored in Redis", {
    userId,
    orgId: organization.id,
    orgSlug: organization.urlKey,
  });

  return organization.urlKey;
}
