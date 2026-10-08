/** Return a local Planner route; ignore external or malformed login targets. */
export function getPlannerReturnTo(value: string | null): string | null {
  if (
    !value ||
    value.length > 1024 ||
    !value.startsWith("/plans/") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return null;
  const target = new URL(value, "https://planner.invalid");
  return target.origin === "https://planner.invalid" &&
    /^\/plans\/\d{4}-(?:0[1-9]|1[0-2])(?:\/(?:progress|reminders|connections|trash|goals\/new))?$/u.test(
      target.pathname,
    )
    ? value
    : null;
}
