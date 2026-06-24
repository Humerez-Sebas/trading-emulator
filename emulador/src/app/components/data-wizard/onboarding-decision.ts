/** First-launch redirect: a brand-new user (no datasets yet) goes to /mercados. */
export function needsR2Onboarding(datasetCount: number): boolean {
  return datasetCount === 0;
}
