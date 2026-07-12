export const ROLE_IDS = ["admin", "normal"] as const;
export const PLAN_IDS = ["free", "pro"] as const;
export const ENTITLEMENT_IDS = [
  "podcast.sample.view",
  "podcast.generate",
  "podcast.download",
  "podcast.chat",
  "calendar.connect",
  "x.personal_sources",
  "podcast.english.generate",
  "x.publish",
  "integration.manage",
  "access.manage",
] as const;

export const ADMIN_FIXED_ENTITLEMENTS = [
  "podcast.english.generate",
  "x.publish",
  "integration.manage",
  "access.manage",
] as const;
