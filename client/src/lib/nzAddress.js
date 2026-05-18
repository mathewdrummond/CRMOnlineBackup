function pickFirst(...values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

export function mapNzAddressSuggestionToFields(suggestion) {
  const address = suggestion?.address || {};
  const streetLine = [
    pickFirst(address.house_number),
    pickFirst(address.road, address.pedestrian, address.footway, address.cycleway),
  ].filter(Boolean).join(" ").trim();

  const suburb = pickFirst(
    address.suburb,
    address.neighbourhood,
    address.city_district,
    address.subdivision,
  );

  return {
    address: [streetLine, suburb].filter(Boolean).join(", ") || pickFirst(suggestion?.display_name),
    city: pickFirst(address.city, address.town, address.village, address.municipality, address.hamlet),
    state: pickFirst(address.state, address.region, address.county),
    postal_code: pickFirst(address.postcode),
    country: pickFirst(address.country, "New Zealand"),
    suburb,
    display_name: pickFirst(suggestion?.display_name),
  };
}
