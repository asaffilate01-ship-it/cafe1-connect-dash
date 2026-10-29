import type { LocalSearchPageConfig } from "@/components/local-search-page";

const path = "/lunch-st-albans";

export const config: LocalSearchPageConfig = {
  path,
  eyebrow: "Lunch in St Albans",
  title: "A St Albans lunch for quick breaks and hungry afternoons.",
  intro:
    "Choose a hot meal, sandwich, panini, wrap, salad or all-day breakfast from our halal menu. Café 1 is open to the public at St Albans Crown Court, with online ordering and local delivery.",
  imageAlt:
    "Café 1 St Albans lunch spread with fish and chips, jacket potato, breakfast and loaded fries",
  highlights: [
    {
      title: "Hot lunches",
      text: "The menu includes choices such as chicken curry with rice, lamb curry with rice, fish and chips and rotating Cafe 1 Classics.",
    },
    {
      title: "Sandwiches and paninis",
      text: "Choose a cold filled sandwich or a hot pressed panini when you want lunch that is easy to take back to work.",
    },
    {
      title: "Wraps, rolls and salads",
      text: "Choose a wrap or filled roll, or look for lighter salad and cold-food options on the live menu.",
    },
    {
      title: "Breakfast for lunch",
      text: "Our breakfast and Desi breakfast categories are served all day, so lunch does not have to mean giving up your favourite morning plate.",
    },
  ],
  sections: [
    {
      heading: "Lunch that fits the time you actually have",
      paragraphs: [
        "Some days allow a proper sit-down break; others leave enough time only to collect a prepared order. Café 1 supports both. Dine in at the café, order at the counter to take away, or place the order online before you arrive.",
        "The range covers filling hot meals and compact desk-friendly choices. Availability can change during service, so use the live menu to make the final choice rather than relying on a saved menu image.",
      ],
      bullets: [
        "Order online for collection before leaving the office",
        "Dine in or take away from 8am to 5pm",
        "Eligible delivery addresses can order until 4:30pm",
        "All food served at Café 1 is halal",
      ],
    },
    {
      heading: "Lunch near St Albans Crown Court",
      paragraphs: [
        "The café is inside St Albans Crown Court on Bricket Road, postcode AL1 3JU. It serves jurors, court users and staff, but it is also open to local workers, residents and other members of the public.",
        "If you are visiting the court, the café gives you a food option without leaving the building. If you are coming from outside, check the contact page for directions and allow for the courthouse’s normal visitor and security procedures.",
      ],
    },
    {
      heading: "Local lunch delivery in St Albans",
      paragraphs: [
        "Café 1 offers its own local delivery within half a mile of the café. Enter your address on the website to confirm that it is inside the delivery area and to see the current order conditions before payment.",
        "Delivery runs from 8:30am to 4:30pm, Monday to Friday, excluding public holidays. Collection and takeaway remain available during the café’s wider 8am to 5pm opening hours.",
      ],
    },
  ],
  faqs: [
    {
      question: "Where can I get lunch near St Albans Crown Court?",
      answer:
        "Café 1 is located inside St Albans Crown Court at AL1 3JU and is open to the public. It serves breakfast, lunch, snacks and drinks from 8am to 5pm on open weekdays.",
    },
    {
      question: "What lunch food does Café 1 serve?",
      answer:
        "The menu includes hot specials, curries with rice, fish and chips, sandwiches, paninis, wraps, rolls, salads and all-day breakfast. Check the live menu for current availability and prices.",
    },
    {
      question: "Can I order lunch for collection?",
      answer:
        "Yes. Choose collection when ordering online, or order at the counter for takeaway. The website will show the available order times.",
    },
    {
      question: "Does Café 1 deliver lunch to nearby offices?",
      answer:
        "Yes, when the delivery address is within the half-mile service area. Delivery is available from 8:30am to 4:30pm on open weekdays, subject to the current checkout conditions.",
    },
  ],
};
