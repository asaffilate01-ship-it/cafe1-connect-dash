// Single source of truth for NAP (Name, Address, Phone).
// Keep this identical to every directory listing (Google Business Profile,
// Bing Places, Apple Business Connect, Enjoy St Albans, TripAdvisor, Zabihah).
export const NAP = {
  name: "Café 1 St Albans",
  legalName: "Café 1",
  url: "https://cafe1stalbans.co.uk",
  email: "info@cafe1stalbans.co.uk",
  telephone: "+44 1727 400117",
  streetAddress: "St Albans Crown Court, Bricket Road",
  addressLocality: "St Albans",
  addressRegion: "Hertfordshire",
  postalCode: "AL1 3JU",
  addressCountry: "GB",
  latitude: 51.7508,
  longitude: -0.3352,
  priceRange: "££",
  cuisines: ["Coffee", "Breakfast", "British", "Halal", "Desi", "Sandwiches"],
  openTime: "08:00",
  closeTime: "17:00",
  weekdays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  deliveryRadiusMetres: 805,
} as const;

export function localBusinessJsonLd(image: string) {
  return {
    "@context": "https://schema.org",
    "@type": ["Restaurant", "LocalBusiness", "CafeOrCoffeeShop"],
    "@id": `${NAP.url}/#localbusiness`,
    name: NAP.name,
    legalName: NAP.legalName,
    url: NAP.url,
    image,
    logo: `${NAP.url}/icons/icon-512.png`,
    email: NAP.email,
    telephone: NAP.telephone,
    description:
      "Café 1 is a halal café at St Albans Crown Court serving Italian coffee, all-day breakfasts, British classics and Desi favourites, with free delivery within half a mile.",
    servesCuisine: [...NAP.cuisines],
    priceRange: NAP.priceRange,
    currenciesAccepted: "GBP",
    paymentAccepted: "Cash, Credit Card, Debit Card, Apple Pay, Google Pay",
    hasMenu: `${NAP.url}/menu`,
    acceptsReservations: "False",
    publicAccess: true,
    smokingAllowed: false,
    address: {
      "@type": "PostalAddress",
      streetAddress: NAP.streetAddress,
      addressLocality: NAP.addressLocality,
      addressRegion: NAP.addressRegion,
      postalCode: NAP.postalCode,
      addressCountry: NAP.addressCountry,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: NAP.latitude,
      longitude: NAP.longitude,
    },
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: {
        "@type": "GeoCoordinates",
        latitude: NAP.latitude,
        longitude: NAP.longitude,
      },
      geoRadius: NAP.deliveryRadiusMetres,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [...NAP.weekdays],
        opens: NAP.openTime,
        closes: NAP.closeTime,
      },
    ],
    potentialAction: [
      {
        "@type": "OrderAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${NAP.url}/menu`,
          inLanguage: "en-GB",
          actionPlatform: [
            "http://schema.org/DesktopWebPlatform",
            "http://schema.org/IOSPlatform",
            "http://schema.org/AndroidPlatform",
          ],
        },
        deliveryMethod: [
          "http://purl.org/goodrelations/v1#DeliveryModeOwnFleet",
          "http://purl.org/goodrelations/v1#DeliveryModePickUp",
        ],
      },
    ],
  };
}
