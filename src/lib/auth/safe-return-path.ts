const INTERNAL_ORIGIN = "https://skill-compass.invalid";
const DEFAULT_RETURN_PATH = "/dashboard";
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F\u0080-\u009F]/;

export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_RETURN_PATH;

  try {
    const decodedValue = decodeURIComponent(value);
    if (!isInternalPath(value) || !isInternalPath(decodedValue)) {
      return DEFAULT_RETURN_PATH;
    }

    const url = new URL(value, INTERNAL_ORIGIN);
    const returnPath = `${url.pathname}${url.search}${url.hash}`;

    if (url.origin !== INTERNAL_ORIGIN || !isInternalPath(returnPath)) {
      return DEFAULT_RETURN_PATH;
    }

    return returnPath;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
}

function isInternalPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !CONTROL_CHARACTER.test(value)
  );
}
