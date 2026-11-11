import { describe, it, expect } from "vitest";
import { guessCategory } from "@/lib/cooking";
const cases: [string,string|null][] = [
 ["Chocolate Bar","Snacks"],["Capuccino","Hot Drinks"],["Crisps","Snacks"],["Flapjack","Biscuits"],
 ["Cookies/Biscuits","Biscuits"],["Red Bull","Drinks"],["RedBull Mojito","Mocktails"],["Orange Juice","Drinks"],
 ["Chicken Wrap","Wraps"],["Cheeseburger and Chips","Burgers"],["Hot Dog with Chips","Hot Dogs"],
 ["Chicken Paratha Roll","Paratha"],["Chana n rice","Cafe 1 Classics"],["Side salad","Salads"],
 ["Plain Croissant","Croissant"],["Fruit Pot","Fruit Pot"],["Oat Milk","Extras"],["Matcha","Hot Drinks"],
 ["Cheese and Onion omelette","Omelettes"],["Sausage & Cheese panini","Panini"],["Make it a meal","Extras"],["Small  Snickers","Snacks"],
 ["Chicken Samosa","Samosas"],["Shepherd's Pie","Cafe 1 Classics"],["W chips","Chips"],["Monster Energy","Drinks"],
];
describe("guessCategory",()=>{for(const [n,e] of cases) it(n,()=>expect(guessCategory(n)).toBe(e));});
