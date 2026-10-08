/** Only local Planner screens can be restored after an authenticated login. */
export function isPlannerReturnTo(value: string): boolean {
  if (
    value.length > 1024 ||
    !value.startsWith("/plans/") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  const target = new URL(value, "https://planner.invalid");
  return (
    target.origin === "https://planner.invalid" &&
    /^\/plans\/\d{4}-(?:0[1-9]|1[0-2])(?:\/(?:progress|reminders|connections|trash|goals\/new))?$/u.test(
      target.pathname,
    )
  );
}
