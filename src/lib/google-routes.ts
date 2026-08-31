/**
 * Static route compatibility wrapper.
 * Re-exports the local Andhra Pradesh static routing engine without Google Cloud dependencies.
 */
export * from "./static-router";
import { calculateStaticRoadRoutes } from "./static-router";

export const calculateGoogleRoutes = calculateStaticRoadRoutes;
