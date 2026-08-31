export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &middot; &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

export function getCartoTileUrl(prefersDarkMode: boolean) {
  const style = prefersDarkMode ? "dark_all" : "light_all";
  const apiKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
  const query = apiKey ? `?key=${apiKey}` : "";
  return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png${query}`;
}
