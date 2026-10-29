import type { LocalSearchPageConfig } from "@/components/local-search-page";

const path = "/breakfast-st-albans";

export const config: LocalSearchPageConfig = {
  path,
  eyebrow: "Breakfast in St Albans",
  title: "A proper halal breakfast in St Albans—served all day.",
  intro:
    "Start with a cooked breakfast, a Desi favourite, a fresh omelette or something quick with coffee. Café 1 is open to the public inside St Albans Crown Court, Monday to Friday from 8am.",
  imageAlt:
    "Café 1 breakfast and lunch spread including a cooked breakfast, hot meal and loaded fries",
  highlights: [
    {
      title: "Cooked breakfast plates",
      text: "Choose a filling breakfast plate with familiar favourites including eggs, toast, beans and hash browns. Check the live menu for today’s full combinations.",
    },
    {
      title: "Desi breakfast",
      text: "Paratha, Desi omelette and chana can be ordered separately or together for a warm, savoury start to the day.",
    },
    {
      title: "Omelettes made to order",
      text: "Plain, cheese and onion, cheese and tomato, chicken and cheese, and Desi-style choices are listed on the menu.",
    },
    {
      title: "Quick breakfast and coffee",
      text: "If time is short, order online for collection or choose a smaller breakfast, toast, pastry or hot drink at the counter.",
    },
  ],
  sections: [
    {
      heading: "Breakfast that does not stop at a morning deadline",
      paragraphs: [
        "Our breakfast menu is served all day during normal weekday opening hours. That makes Café 1 useful whether you are heading into work early, taking a break between appointments or want breakfast food at lunchtime.",
        "The live menu shows current availability, prices, vegetarian labels and any choices you need to make. If a dietary tag or ingredient is important to you, speak to the team before ordering so we can give you the most current information.",
      ],
      bullets: [
        "Breakfast service from 8am on open weekdays",
        "All food served at Café 1 is halal",
        "Vegetarian choices are clearly separated from meat add-ons",
        "Order at the counter or online for collection, takeaway or dine-in",
      ],
    },
    {
      heading: "Easy to find on Bricket Road",
      paragraphs: [
        "Café 1 is inside St Albans Crown Court at AL1 3JU, close to the civic and court area. The café is open to the general public as well as jurors, court visitors, legal professionals and staff.",
        "Because the café is within a working courthouse, allow time for the building’s normal entrance and security arrangements. Our contact page has the address, phone number, map and directions link for planning your visit.",
      ],
    },
    {
      heading: "Breakfast for the table, the desk or the journey",
      paragraphs: [
        "You can dine in, take your order away, place a collection order online or request delivery within our half-mile local area. Delivery orders are accepted from 8:30am to 4:30pm on open weekdays; the site checks your address before checkout.",
        "For the quickest choice, browse the menu before you set off. Online availability reflects the café’s current menu more reliably than an old photo or third-party listing.",
      ],
    },
  ],
  faqs: [
    {
      question: "What time does breakfast start at Café 1 St Albans?",
      answer:
        "Breakfast starts when the café opens at 8am, Monday to Friday. Café 1 is closed on weekends and public holidays.",
    },
    {
      question: "Is the breakfast at Café 1 halal?",
      answer:
        "Yes. All food served at Café 1 is halal. If you need supplier, ingredient or allergen details, ask the team before ordering so they can check the current product information.",
    },
    {
      question: "Can I order breakfast after the morning?",
      answer:
        "Yes. The breakfast and Desi breakfast categories are served all day during normal opening hours, subject to current availability.",
    },
    {
      question: "Does Café 1 deliver breakfast in St Albans?",
      answer:
        "Local delivery is available within half a mile of Café 1 from 8:30am on open weekdays. Enter the delivery address on the website to confirm eligibility and see current checkout terms.",
    },
  ],
};
