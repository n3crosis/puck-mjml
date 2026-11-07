export const PNG_IMAGE_SOURCE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
export const pngImageBytes = () =>
  Uint8Array.from(atob(PNG_IMAGE_SOURCE.split(",")[1]), (character) => character.charCodeAt(0));
