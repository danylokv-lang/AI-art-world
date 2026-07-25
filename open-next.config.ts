import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Defaults are correct for this app.
 *
 * No incremental cache override: there are no ISR or cached data routes. A
 * generated world is ~2KB of JSON that the client re-derives into a scene from
 * its seed, so there is nothing heavy enough at the edge to be worth caching.
 * Add `r2IncrementalCache` here if that changes.
 */
export default defineCloudflareConfig();
