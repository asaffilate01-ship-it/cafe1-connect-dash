import type { LocalSearchPageConfig } from "@/components/local-search-page";

const path = "/halal-food-st-albans";

export const config: LocalSearchPageConfig = {
  path,
  eyebrow: "Halal food in St Albans",
  title: "Halal food for breakfast, lunch and everything between.",
  intro:
    "Every food item served at Café 1 is halal, so you can choose across the café menu rather than search for a separate halal section. Visit us at St Albans Crown Court or order online on open weekdays.",
  imageAlt:
    "Halal breakfast and lunch choices from Café 1 St Albans including cooked food and sides",
  highlights: [
    {
      title: "One halal food menu",
      text: "Breakfasts, meat dishes, sandwiches and hot lunches are part of the same halal food offer—not a small add-on menu.",
    },
    {
      title: "British and Desi choices",
      text: "Move from cooked breakfast plates and omelettes to parathas, chana, kebabs and curries depending on the meal you want.",
    },
    {
      title: "Vegetarian choices too",
      text: "Vegetarian menu items and modifier choices are labelled separately. Halal and vegetarian describe different dietary needs, so check both labels.",
    },
    {
      title: "Ask before you order",
      text: "For supplier, ingredient, allergen or cross-contact questions, speak to the café team so we can check the current product information.",
    },
  ],
  sections: [
    {
      heading: "What halal means on our menu",
      paragraphs: [
        "Café 1 states that all food it serves is halal. That includes the food offered across breakfast and lunch categories, not only selected meat dishes. We avoid describing an item as independently certified unless the supporting supplier information is available for that product.",
        "Halal status does not by itself answer every dietary question. Allergens, vegetarian requirements and personal preferences still need to be checked separately. The online menu provides useful labels, and the team can help with the latest ingredient information before you commit to an order.",
      ],
      bullets: [
        "Halal cooked breakfasts and breakfast rolls",
        "Halal chicken, lamb and kebab menu choices",
        "Desi breakfast, parathas, chana and curries",
        "Vegetarian and lighter café options alongside meat dishes",
      ],
    },
    {
      heading: "A halal café near St Albans city and civic centre",
      paragraphs: [
        "Our address is St Albans Crown Court, Bricket Road, St Albans, Hertfordshire AL1 3JU. The café is open to the public, so local workers and residents can visit as well as people attending court.",
        "We open Monday to Friday from 8am to 5pm and close at weekends and on public holidays. As the café is inside a courthouse, follow the building’s current visitor and security arrangements when you arrive.",
      ],
    },
    {
      heading: "Order halal food in the way that suits your day",
      paragraphs: [
        "Order at the till if you are already in the building, or use the website for collection, takeaway, dine-in ordering and eligible local delivery. Delivery operates from 8:30am to 4:30pm within a half-mile radius on open weekdays.",
        "The live menu is the best place to confirm what is being sold today. It also prevents an old social post, blog article or third-party menu from becoming an inaccurate promise about stock or price.",
      ],
    },
  ],
  faqs: [
    {
      question: "Is all food at Café 1 St Albans halal?",
      answer:
        "Yes. Café 1’s stated food policy is that all food served is halal. Ask the team if you need to see or discuss current supplier information for a particular item.",
    },
    {
      question: "Does Café 1 serve halal breakfast and halal lunch?",
      answer:
        "Yes. The food offer runs from all-day breakfast and Desi breakfast to sandwiches, paninis, wraps, rolls, curries and other hot lunch choices, subject to availability.",
    },
    {
      question: "Are vegetarian items automatically halal?",
      answer:
        "Café 1’s food is halal, but vegetarian is a separate classification. Use the vegetarian labels for the main item and each modifier, and ask the team when an ingredient matters to you.",
    },
    {
      question: "Can members of the public visit Café 1?",
      answer:
        "Yes. Café 1 is open to the public inside St Albans Crown Court. Visitors should allow time for the building’s normal entrance and security arrangements.",
    },
  ],
};
