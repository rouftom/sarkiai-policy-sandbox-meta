/**
 * Safely attempts to parse a JSON string.
 * Returns the parsed object if successful and it's a valid object, otherwise returns false.
 */
export const tryParseJSON = (dataString: any): any | false => {
  if (!dataString || typeof dataString !== 'string') return false;
  try {
    const parsedObject = JSON.parse(dataString);
    if (parsedObject && typeof parsedObject === "object") {
      return parsedObject;
    }
  } catch (e) {
    // Silent catch for non-JSON strings
  }
  return false;
};
