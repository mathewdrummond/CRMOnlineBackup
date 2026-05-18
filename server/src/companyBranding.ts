import fs from "fs";
import path from "path";

export const MILLBROOK_LOGO_ALT = "Millbrook Furniture Solutions Ltd";

const MILLBROOK_LOGO_PATH = path.resolve(__dirname, "../../client/src/assets/millbrook-logo.png");

let cachedLogoDataUri: string | null = null;

export function getMillbrookCompanyLogoDataUri() {
  if (cachedLogoDataUri !== null) return cachedLogoDataUri;
  try {
    const imageBuffer = fs.readFileSync(MILLBROOK_LOGO_PATH);
    cachedLogoDataUri = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  } catch {
    cachedLogoDataUri = "";
  }
  return cachedLogoDataUri;
}
