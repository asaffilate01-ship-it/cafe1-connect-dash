-- Cafe 1 St Albans complete August 2026 menu and enforceable modifier rules.

ALTER TABLE public.menu_modifiers
  ADD COLUMN IF NOT EXISTS min_selections integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_selections integer,
  ADD COLUMN IF NOT EXISTS is_exclusive boolean NOT NULL DEFAULT false;

UPDATE public.menu_modifiers
SET min_selections = GREATEST(min_selections, CASE WHEN required THEN 1 ELSE 0 END),
    max_selections = CASE WHEN group_type = 'single' THEN 1 ELSE max_selections END;

DO $$ BEGIN
  ALTER TABLE public.menu_modifiers
    ADD CONSTRAINT menu_modifiers_selection_range_chk
    CHECK (min_selections >= 0 AND (max_selections IS NULL OR max_selections >= min_selections));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TEMP TABLE cafe1_target_site ON COMMIT DROP AS
SELECT id
FROM public.sites
ORDER BY CASE WHEN lower(name) LIKE '%st albans%' THEN 0 ELSE 1 END, created_at
LIMIT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cafe1_target_site) THEN
    RAISE EXCEPTION 'Cafe 1 site is required before loading the menu';
  END IF;
END $$;

CREATE TEMP TABLE cafe1_categories (
  name text PRIMARY KEY,
  description text,
  sort_order integer NOT NULL
) ON COMMIT DROP;

INSERT INTO cafe1_categories VALUES
  ('Breakfast','Breakfast served all day',10),
  ('Desi Breakfast','Desi breakfast served all day',20),
  ('Omelettes','Freshly cooked omelettes',30),
  ('Extras','Breakfast and meal extras',40),
  ('Toast','Toast and toast toppings',50),
  ('Sandwiches','Fresh sandwiches',60),
  ('Toasties','Hot toasted sandwiches',70),
  ('Baguettes','Fresh filled baguettes',80),
  ('Panini','Hot pressed panini',90),
  ('Savoury (English) Muffins','Savoury English muffins',100),
  ('Samosas','Fresh samosas',110),
  ('Jacket Potatoes','Jacket potatoes with optional toppings',120),
  ('Chef''s Specials','Freshly prepared hot meals',130),
  ('Kids Meals','Kids meals include a cup of cordial',140),
  ('Chips','Chips and loaded chips',150),
  ('Parathas','Filled and plain parathas',160),
  ('Salads','Fresh salads',170),
  ('Desserts','Desserts and cakes',180),
  ('Milkshakes','Classic and premium milkshakes',190),
  ('Drinks','Cold drinks, water and mocktails',200),
  ('Iced Coffee','Iced coffee with flavour choices',210),
  ('Iced Matcha Latte','Iced matcha latte with flavour choices',220),
  ('Rolls','Kebab and paratha rolls',230),
  ('Burgers','Burgers and meal upgrades',240),
  ('Hot Dog','Jumbo hot dogs',250),
  ('Wraps','Mini chicken and kebab wraps',260),
  ('Grill & Kebabs','Grills and kebabs with a side and sauces',270),
  ('Naan Rolls','Small naan rolls',280),
  ('Nuggets','Chicken nuggets',290),
  ('Cold Pasta Pot','Cold pasta pots',300),
  ('Snacks & Treats','Crisps, confectionery and snacks',310),
  ('Hot Drinks','Coffee, tea and hot chocolate',320),
  ('Speciality Tea','Speciality teas',330),
  ('Croissants & Pastries','Croissants and pastries',340),
  ('Sauces / Dips','Individual sauces and dips',350);

UPDATE public.menu_categories category
SET description = seed.description, sort_order = seed.sort_order, active = true
FROM cafe1_categories seed, cafe1_target_site site
WHERE category.site_id = site.id AND lower(category.name) = lower(seed.name);

INSERT INTO public.menu_categories (site_id, name, description, sort_order, active)
SELECT site.id, seed.name, seed.description, seed.sort_order, true
FROM cafe1_categories seed CROSS JOIN cafe1_target_site site
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_categories category
  WHERE category.site_id = site.id AND lower(category.name) = lower(seed.name)
);

CREATE TEMP TABLE cafe1_items (
  category text NOT NULL,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL,
  is_veg boolean NOT NULL DEFAULT false,
  is_beverage boolean NOT NULL DEFAULT false,
  needs_cooking boolean NOT NULL DEFAULT true,
  loyalty_drink boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  PRIMARY KEY (category, name)
) ON COMMIT DROP;

INSERT INTO cafe1_items VALUES
  ('Breakfast','Breakfast Special','Toast, fried egg, sausage, beans and hash brown',649,false,false,true,false,10),
  ('Breakfast','Mega Breakfast','Toast, fried eggs, sausage, beans, hash brown, rashers, mushrooms and grilled tomatoes',899,false,false,true,false,20),
  ('Desi Breakfast','Paratha and Desi Omelette',NULL,700,true,false,true,false,10),
  ('Desi Breakfast','Paratha and Chana (chickpeas)',NULL,600,true,false,true,false,20),
  ('Desi Breakfast','Paratha, Desi Omelette and Chana (chickpeas)',NULL,899,true,false,true,false,30),
  ('Omelettes','Plain Omelette',NULL,399,true,false,true,false,10),
  ('Omelettes','Cheese and onion',NULL,449,true,false,true,false,20),
  ('Omelettes','Cheese and tomato',NULL,449,true,false,true,false,30),
  ('Omelettes','Chicken & cheese',NULL,499,false,false,true,false,40),
  ('Omelettes','Desi Omelette',NULL,499,true,false,true,false,50),
  ('Extras','Toast (butter only)',NULL,100,true,false,true,false,10),
  ('Extras','Grilled Tomatoes',NULL,100,true,false,true,false,20),
  ('Extras','2 Fish Fingers',NULL,150,false,false,true,false,30),
  ('Extras','Sausage',NULL,150,false,false,true,false,40),
  ('Extras','Beans',NULL,150,true,false,true,false,50),
  ('Extras','Rashers',NULL,200,false,false,true,false,60),
  ('Extras','Mushrooms',NULL,150,true,false,true,false,70),
  ('Extras','Fried Egg',NULL,150,true,false,true,false,80),
  ('Extras','Scrambled egg',NULL,150,true,false,true,false,90),
  ('Extras','Boiled egg',NULL,200,true,false,true,false,100),
  ('Extras','2 Hash browns',NULL,150,true,false,true,false,110),
  ('Toast','Butter only',NULL,100,true,false,true,false,10),
  ('Toast','Chocolate Spread',NULL,150,true,false,true,false,20),
  ('Toast','Strawberry Jam',NULL,130,true,false,true,false,30),
  ('Toast','Orange Marmalade',NULL,130,true,false,true,false,40),
  ('Toast','Beans on Toast',NULL,250,true,false,true,false,50),
  ('Toast','Cheese on Toast',NULL,300,true,false,true,false,60),
  ('Toast','Egg on Toast',NULL,300,true,false,true,false,70),
  ('Sandwiches','Cheese',NULL,300,true,false,false,false,10),
  ('Sandwiches','Cheese and Tomato',NULL,300,true,false,false,false,20),
  ('Sandwiches','Chicken, Mayo, Sweetcorn',NULL,350,false,false,false,false,30),
  ('Sandwiches','Tuna, Mayo, Sweetcorn',NULL,350,false,false,false,false,40),
  ('Sandwiches','Salami and cheese',NULL,350,false,false,false,false,50),
  ('Sandwiches','Sausage and Cheese',NULL,400,false,false,true,false,60),
  ('Sandwiches','Vegan sausage',NULL,350,true,false,true,false,70),
  ('Toasties','Cheese and Tomato',NULL,400,true,false,true,false,10),
  ('Toasties','Cheese and onion',NULL,400,true,false,true,false,20),
  ('Toasties','Chicken and cheese',NULL,450,false,false,true,false,30),
  ('Toasties','Salami and cheese',NULL,450,false,false,true,false,40),
  ('Toasties','Tuna, Mayo, Sweetcorn & cheese',NULL,450,false,false,true,false,50),
  ('Toasties','Sausage and Cheese',NULL,450,false,false,true,false,60),
  ('Toasties','Vegan sausage and cheese',NULL,450,true,false,true,false,70),
  ('Toasties','Desi omelette',NULL,450,true,false,true,false,80),
  ('Baguettes','Cheese and Tomato',NULL,400,true,false,false,false,10),
  ('Baguettes','Chicken Mayo Sweetcorn',NULL,500,false,false,false,false,20),
  ('Baguettes','Tuna mayo crunch',NULL,500,false,false,false,false,30),
  ('Baguettes','Salami & Cheese',NULL,500,false,false,false,false,40),
  ('Panini','Cheese & onion',NULL,500,true,false,true,false,10),
  ('Panini','Cheese & Tomato',NULL,500,true,false,true,false,20),
  ('Panini','Chicken & Cheese',NULL,600,false,false,true,false,30),
  ('Panini','Salami & cheese',NULL,600,false,false,true,false,40),
  ('Panini','Tuna & Cheese',NULL,600,false,false,true,false,50),
  ('Panini','Keema & cheese',NULL,600,false,false,true,false,60),
  ('Panini','Sausage & cheese',NULL,600,false,false,true,false,70),
  ('Panini','Chicken Shawarma',NULL,600,false,false,true,false,80),
  ('Panini','Lamb donner',NULL,600,false,false,true,false,90),
  ('Panini','Mix kebab',NULL,600,false,false,true,false,100),
  ('Savoury (English) Muffins','Egg and Cheese',NULL,300,true,false,true,false,10),
  ('Savoury (English) Muffins','Egg, Cheese and Rasher',NULL,400,false,false,true,false,20),
  ('Samosas','Veg',NULL,250,true,false,true,false,10),
  ('Samosas','Chicken',NULL,250,false,false,true,false,20),
  ('Samosas','Spicy keema',NULL,250,false,false,true,false,30),
  ('Jacket Potatoes','Plain with Butter','Add one or more toppings',275,true,false,true,false,10),
  ('Chef''s Specials','Cheese Flan','Choose on its own, with salad, or with chips and beans',500,true,false,true,false,10),
  ('Chef''s Specials','Shepherds pie','Choose on its own, with salad, or with chips and beans',600,false,false,true,false,20),
  ('Chef''s Specials','Lasagne','Choose on its own, with salad, or with chips and beans',600,false,false,true,false,30),
  ('Chef''s Specials','Veg lasagne','Choose on its own, with salad, or with chips and beans',500,true,false,true,false,40),
  ('Chef''s Specials','Chicken pasta','Choose on its own or with salad',600,false,false,true,false,50),
  ('Chef''s Specials','Fish & chips','Choose beans, peas or mushy peas',800,false,false,true,false,60),
  ('Chef''s Specials','Chicken Curry and Rice','Optional side salad available',850,false,false,true,false,70),
  ('Chef''s Specials','Meat (lamb) Curry and Rice','Optional side salad available',950,false,false,true,false,80),
  ('Kids Meals','3 fish fingers, chips, beans','Includes a cup of cordial',500,false,false,true,false,10),
  ('Kids Meals','4 nuggets, chips, beans','Includes a cup of cordial',500,false,false,true,false,20),
  ('Kids Meals','4 fish fingers & chips','Includes a cup of cordial',550,false,false,true,false,30),
  ('Kids Meals','5 nuggets & chips','Includes a cup of cordial',550,false,false,true,false,40),
  ('Chips','Regular',NULL,250,true,false,true,false,10),
  ('Chips','Large',NULL,300,true,false,true,false,20),
  ('Chips','Cheesy chips',NULL,450,true,false,true,false,30),
  ('Chips','Keema loaded',NULL,600,false,false,true,false,40),
  ('Chips','Fried chicken loaded',NULL,600,false,false,true,false,50),
  ('Chips','Grilled chicken loaded',NULL,600,false,false,true,false,60),
  ('Chips','Lamb donner loaded',NULL,600,false,false,true,false,70),
  ('Chips','Chicken shawarma loaded',NULL,600,false,false,true,false,80),
  ('Chips','Mix kebab loaded',NULL,600,false,false,true,false,90),
  ('Parathas','Desi paratha',NULL,250,true,false,true,false,10),
  ('Parathas','Aloo paratha',NULL,300,true,false,true,false,20),
  ('Parathas','Cheese & onion paratha',NULL,350,true,false,true,false,30),
  ('Parathas','Chicken aloo paratha',NULL,350,false,false,true,false,40),
  ('Parathas','Chicken & cheese paratha',NULL,350,false,false,true,false,50),
  ('Salads','Plain',NULL,250,true,false,false,false,10),
  ('Salads','Grilled chicken',NULL,495,false,false,true,false,20),
  ('Salads','Tuna mayo sweetcorn',NULL,495,false,false,false,false,30),
  ('Desserts','Chocolate mud pie',NULL,300,true,false,false,false,10),
  ('Desserts','Sprinkle cake',NULL,300,true,false,false,false,20),
  ('Milkshakes','Vanilla',NULL,400,true,true,false,false,10),
  ('Milkshakes','Strawberry',NULL,400,true,true,false,false,20),
  ('Milkshakes','Banana',NULL,400,true,true,false,false,30),
  ('Milkshakes','Chocolate',NULL,400,true,true,false,false,40),
  ('Milkshakes','Kinder bueno',NULL,600,true,true,false,false,50),
  ('Milkshakes','Oreo',NULL,600,true,true,false,false,60),
  ('Milkshakes','Aero Mint',NULL,600,true,true,false,false,70),
  ('Milkshakes','Snickers',NULL,600,true,true,false,false,80),
  ('Milkshakes','Lotus Biscoff',NULL,600,true,true,false,false,90),
  ('Milkshakes','Twix',NULL,600,true,true,false,false,100),
  ('Milkshakes','Kitkat',NULL,600,true,true,false,false,110),
  ('Drinks','Coca Cola 330ml',NULL,150,true,true,false,false,10),
  ('Drinks','Coke Zero 330ml',NULL,150,true,true,false,false,20),
  ('Drinks','Fanta orange 330ml',NULL,150,true,true,false,false,30),
  ('Drinks','Fanta fruit Twist 330ml',NULL,150,true,true,false,false,40),
  ('Drinks','7up 330ml',NULL,150,true,true,false,false,50),
  ('Drinks','Strawberry Miranda 330ml',NULL,150,true,true,false,false,60),
  ('Drinks','Lipton peach ice tea 330ml',NULL,150,true,true,false,false,70),
  ('Drinks','Apple juice 330ml',NULL,150,true,true,false,false,80),
  ('Drinks','Orange Juice 330ml',NULL,150,true,true,false,false,90),
  ('Drinks','Red bull 250ml',NULL,250,true,true,false,false,100),
  ('Drinks','Monster Energy 500ml',NULL,250,true,true,false,false,110),
  ('Drinks','Monster energy ultra (zero sugar) 500ml',NULL,250,true,true,false,false,120),
  ('Drinks','Monster Mango Loco 500ml',NULL,250,true,true,false,false,130),
  ('Drinks','Sprite 500ml',NULL,250,true,true,false,false,140),
  ('Drinks','Diet Coke 500ml',NULL,250,true,true,false,false,150),
  ('Drinks','Fanta orange (zero sugar) 500ml',NULL,250,true,true,false,false,160),
  ('Drinks','Oasis summer fruits 500ml',NULL,250,true,true,false,false,170),
  ('Drinks','Oasis citrus fruits 500ml',NULL,250,true,true,false,false,180),
  ('Drinks','Still water 500ml',NULL,120,true,true,false,false,190),
  ('Drinks','Sparkling water 500ml',NULL,150,true,true,false,false,200),
  ('Drinks','Strawberry bliss mocktail',NULL,495,true,true,false,false,210),
  ('Drinks','Green apple mocktail',NULL,495,true,true,false,false,220),
  ('Drinks','Minty refresh mocktail',NULL,495,true,true,false,false,230),
  ('Drinks','Mango sunset mocktail',NULL,495,true,true,false,false,240),
  ('Drinks','Red bull mojito',NULL,695,true,true,false,false,250),
  ('Iced Coffee','Iced Coffee','Choose a flavour',450,true,true,false,false,10),
  ('Iced Matcha Latte','Iced Matcha Latte','Choose a flavour',450,true,true,false,false,10),
  ('Rolls','Krunchy Kebab Roll',NULL,250,false,false,true,false,10),
  ('Rolls','Sheekh Kebab paratha roll','Chicken',250,false,false,true,false,20),
  ('Burgers','1/4 Pounder','Cheese, lettuce and mayo',450,false,false,true,false,10),
  ('Burgers','1/2 Pounder','Cheese, lettuce and mayo',550,false,false,true,false,20),
  ('Burgers','Chicken Fillet Burger','Lettuce and mayo',550,false,false,true,false,30),
  ('Burgers','Chicken Shawarma Burger','Lettuce and mayo',600,false,false,true,false,40),
  ('Burgers','Lamb Donner Burger','Lettuce and mayo',500,false,false,true,false,50),
  ('Burgers','Hash Fillet Burger','Cheese, lettuce and mayo',600,false,false,true,false,60),
  ('Burgers','Mix kebab burger','Lettuce and mayo',550,false,false,true,false,70),
  ('Hot Dog','Jumbo hot dog single','Ketchup, mustard and crispy fried onions',450,false,false,true,false,10),
  ('Wraps','Mini fried chicken wrap','Lettuce and mayo',400,false,false,true,false,10),
  ('Wraps','Mini grilled chicken wrap','Lettuce and mayo',450,false,false,true,false,20),
  ('Wraps','Mini chicken Shawarma wrap','Lettuce and mayo',450,false,false,true,false,30),
  ('Wraps','Mini Lamb Donner wrap',NULL,400,false,false,true,false,40),
  ('Wraps','Mini mix kebab wrap',NULL,500,false,false,true,false,50),
  ('Grill & Kebabs','2 Sheekh kebab',NULL,599,false,false,true,false,10),
  ('Grill & Kebabs','Chicken shawarma',NULL,699,false,false,true,false,20),
  ('Grill & Kebabs','Chicken tikka',NULL,699,false,false,true,false,30),
  ('Grill & Kebabs','Lamb donner',NULL,599,false,false,true,false,40),
  ('Grill & Kebabs','Mix kebab (don & shaw)',NULL,649,false,false,true,false,50),
  ('Grill & Kebabs','Lamb chops',NULL,999,false,false,true,false,60),
  ('Grill & Kebabs','Mix grill','Lamb chop, Sheekh kebab, chicken tikka and mix kebab',999,false,false,true,false,70),
  ('Naan Rolls','Chicken tikka','Small naan roll',399,false,false,true,false,10),
  ('Naan Rolls','Sheekh kebab','Small naan roll',399,false,false,true,false,20),
  ('Naan Rolls','Double Sheekh kebab','Small naan roll',499,false,false,true,false,30),
  ('Nuggets','6 nuggets',NULL,400,false,false,true,false,10),
  ('Nuggets','10 nuggets',NULL,650,false,false,true,false,20),
  ('Cold Pasta Pot','Tuna mayo sweetcorn',NULL,300,false,false,false,false,10),
  ('Snacks & Treats','Chewing gum','Choose a flavour',100,true,false,false,false,10),
  ('Snacks & Treats','Polo mints',NULL,100,true,false,false,false,20),
  ('Snacks & Treats','Flapjacks',NULL,150,true,false,false,false,30),
  ('Snacks & Treats','Walkers Crisps','Choose a flavour',150,true,false,false,false,40),
  ('Snacks & Treats','Chocolate bar','Choose a bar',150,true,false,false,false,50),
  ('Snacks & Treats','Biscuit',NULL,100,true,false,false,false,60),
  ('Hot Drinks','Americano',NULL,280,true,true,true,true,10),
  ('Hot Drinks','Cappuccino',NULL,280,true,true,true,true,20),
  ('Hot Drinks','Desi Karak tea',NULL,300,true,true,true,true,30),
  ('Hot Drinks','Double espresso',NULL,300,true,true,true,true,40),
  ('Hot Drinks','English tea',NULL,200,true,true,true,true,50),
  ('Hot Drinks','Espresso',NULL,199,true,true,true,true,60),
  ('Hot Drinks','Flat white',NULL,280,true,true,true,true,70),
  ('Hot Drinks','Hot Chocolate',NULL,300,true,true,true,true,80),
  ('Hot Drinks','Latte',NULL,280,true,true,true,true,90),
  ('Hot Drinks','Mochacciano',NULL,300,true,true,true,true,100),
  ('Hot Drinks','White americano',NULL,300,true,true,true,true,110),
  ('Speciality Tea','Speciality Tea','Choose a flavour',200,true,true,true,true,10),
  ('Croissants & Pastries','Butter Croissant',NULL,100,true,false,false,false,10),
  ('Croissants & Pastries','Maple & pecan pastry',NULL,120,true,false,false,false,20),
  ('Croissants & Pastries','Cinnamon swirl',NULL,120,true,false,false,false,30),
  ('Croissants & Pastries','Pain au chocolat',NULL,120,true,false,false,false,40),
  ('Sauces / Dips','Ketchup sachet',NULL,20,true,false,false,false,10),
  ('Sauces / Dips','Mayo sachet',NULL,20,true,false,false,false,20),
  ('Sauces / Dips','Chilli',NULL,50,true,false,false,false,30),
  ('Sauces / Dips','Spicy peri mayo',NULL,50,true,false,false,false,40),
  ('Sauces / Dips','Garlic mayo',NULL,50,true,false,false,false,50),
  ('Sauces / Dips','Mint Chutney',NULL,50,true,false,false,false,60);

UPDATE public.menu_items item
SET description = seed.description,
    price_cents = seed.price_cents,
    is_veg = seed.is_veg,
    is_beverage = seed.is_beverage,
    needs_cooking = seed.needs_cooking,
    loyalty_drink = seed.loyalty_drink,
    sort_order = seed.sort_order,
    active = true,
    updated_at = now()
FROM cafe1_items seed
JOIN cafe1_categories category_seed ON category_seed.name = seed.category
JOIN cafe1_target_site site ON true
JOIN public.menu_categories category ON category.site_id = site.id AND lower(category.name) = lower(category_seed.name)
WHERE item.site_id = site.id AND item.category_id = category.id AND lower(item.name) = lower(seed.name);

INSERT INTO public.menu_items (
  site_id, category_id, name, description, price_cents, is_veg, is_beverage,
  needs_cooking, loyalty_drink, sort_order, active
)
SELECT site.id, category.id, seed.name, seed.description, seed.price_cents, seed.is_veg,
       seed.is_beverage, seed.needs_cooking, seed.loyalty_drink, seed.sort_order, true
FROM cafe1_items seed
JOIN cafe1_categories category_seed ON category_seed.name = seed.category
JOIN cafe1_target_site site ON true
JOIN public.menu_categories category ON category.site_id = site.id AND lower(category.name) = lower(category_seed.name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items item
  WHERE item.site_id = site.id AND item.category_id = category.id AND lower(item.name) = lower(seed.name)
);

-- Replace modifiers for this published catalogue; images and operational item metadata are preserved.
DELETE FROM public.menu_modifiers modifier
USING public.menu_categories category, cafe1_categories seed, cafe1_target_site site
WHERE category.site_id = site.id AND lower(category.name) = lower(seed.name)
  AND (modifier.category_id = category.id OR modifier.item_id IN (
    SELECT item.id FROM public.menu_items item WHERE item.category_id = category.id
  ));

CREATE TEMP TABLE cafe1_meal_drinks (name text, sort_order integer) ON COMMIT DROP;
INSERT INTO cafe1_meal_drinks VALUES
  ('Coca Cola',10),('Coke Zero',20),('Fanta orange',30),('Fanta fruit Twist',40),
  ('7up',50),('Strawberry Miranda',60),('Lipton peach ice tea',70),
  ('Apple juice',80),('Orange Juice',90),('Still water',100);

-- Category-level meal combinations make the side, drink and price one atomic choice.
INSERT INTO public.menu_modifiers (
  category_id,name,description,price_cents,sort_order,active,group_name,group_type,
  required,min_selections,max_selections,is_exclusive
)
SELECT category.id, 'Chips & ' || drink.name, 'Meal upgrade', 250, drink.sort_order, true,
       'Make it a meal', 'single', false, 0, 1, false
FROM public.menu_categories category
JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN cafe1_meal_drinks drink
WHERE category.name IN ('Omelettes','Panini','Samosas','Parathas','Salads','Rolls','Burgers','Hot Dog','Wraps','Naan Rolls','Nuggets');

INSERT INTO public.menu_modifiers (
  category_id,name,description,price_cents,sort_order,active,group_name,group_type,
  required,min_selections,max_selections,is_exclusive
)
SELECT category.id, 'Crisp & ' || drink.name, 'Meal upgrade', 200, drink.sort_order, true,
       'Make it a meal', 'single', false, 0, 1, false
FROM public.menu_categories category
JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN cafe1_meal_drinks drink
WHERE category.name IN ('Sandwiches','Baguettes');

INSERT INTO public.menu_modifiers (
  category_id,name,description,price_cents,sort_order,active,group_name,group_type,
  required,min_selections,max_selections,is_exclusive
)
SELECT category.id, side.name || ' & ' || drink.name, 'Meal upgrade', side.price_cents,
       side.sort_order + drink.sort_order, true, 'Make it a meal', 'single', false, 0, 1, false
FROM public.menu_categories category
JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Chips',250,0),('Crisp',200,200)) side(name,price_cents,sort_order)
CROSS JOIN cafe1_meal_drinks drink
WHERE category.name = 'Toasties';

-- Select up to two dips/sauces. No sauce is exclusive and clears other selections.
INSERT INTO public.menu_modifiers (
  category_id,name,price_cents,sort_order,active,group_name,group_type,required,
  min_selections,max_selections,is_exclusive
)
SELECT category.id, dip.name, 0, dip.sort_order, true,
       CASE WHEN category.name IN ('Grill & Kebabs','Naan Rolls') THEN 'Select 2 sauces' ELSE 'Select 2 dips' END,
       'multi', false, 0, 2, dip.name = 'No sauce'
FROM public.menu_categories category
JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES
  ('Ketchup',10),('Mayo',20),('Garlic mayo',30),('Spicy peri mayo',40),
  ('Mint chutney',50),('Chilli',60),('No sauce',70)
) dip(name,sort_order)
WHERE category.name IN ('Omelettes','Toasties','Panini','Samosas','Parathas','Rolls','Burgers','Wraps','Grill & Kebabs','Naan Rolls');

-- Jacket toppings.
INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, topping.name, topping.price, topping.ord, true, 'Toppings', 'multi', false, 0, 6, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Cheese',200,10),('Beans',200,20),('Tuna',300,30),('Chilli con Carne',300,40),('Chicken',300,50),('Spicy keema',300,60)) topping(name,price,ord)
WHERE category.name = 'Jacket Potatoes';

-- Included cordial on every kids meal.
INSERT INTO public.menu_modifiers (category_id,name,description,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, flavour.name, 'Cup of cordial included', 0, flavour.ord, true,
       'Choose cordial flavour', 'single', true, 1, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Blackcurrant Ribena',10),('Orange',20),('Apple',30),('Lemon',40)) flavour(name,ord)
WHERE category.name = 'Kids Meals';

-- Iced drinks: one included flavour, one optional extra flavour and oat milk.
INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, flavour.name, 0, flavour.ord, true, 'Choose your flavour', 'single', true, 1, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Caramel',10),('Vanilla',20),('Blueberry',30),('Strawberry',40),('Raspberry',50),('Mango',60),('Salted caramel',70),('Hazelnut',80),('White chocolate',90),('Milk chocolate',100),('Cinnamon',110)) flavour(name,ord)
WHERE category.name IN ('Iced Coffee','Iced Matcha Latte')
  AND (category.name = 'Iced Matcha Latte' OR flavour.name NOT IN ('Blueberry','Strawberry','Raspberry','Mango'));

INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, flavour.name, 50, flavour.ord, true, 'Extra flavour', 'single', false, 0, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Caramel',10),('Vanilla',20),('Blueberry',30),('Strawberry',40),('Raspberry',50),('Mango',60),('Salted caramel',70),('Hazelnut',80),('White chocolate',90),('Milk chocolate',100),('Cinnamon',110)) flavour(name,ord)
WHERE category.name IN ('Iced Coffee','Iced Matcha Latte')
  AND (category.name = 'Iced Matcha Latte' OR flavour.name NOT IN ('Blueberry','Strawberry','Raspberry','Mango'));

INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, 'Oat milk', 50, 10, true, 'Milk option', 'single', false, 0, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
WHERE category.name IN ('Iced Coffee','Iced Matcha Latte');

-- Cheese slices for the listed fast-food ranges.
INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, 'Add cheese slice', 50, 10, true, 'Extras', 'single', false, 0, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
WHERE category.name IN ('Burgers','Hot Dog','Wraps');

-- Grill serving choice and optional can.
INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, side.name, 0, side.ord, true, 'Served with', 'single', true, 1, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Rice, salad & sauce',10),('Chips, salad & sauce',20),('Naan, salad & sauce',30)) side(name,ord)
WHERE category.name = 'Grill & Kebabs';

INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, drink.name, 100, drink.sort_order, true, 'Add normal can', 'single', false, 0, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN cafe1_meal_drinks drink
WHERE category.name = 'Grill & Kebabs' AND drink.name NOT IN ('Apple juice','Orange Juice','Still water');

-- Item-level helpers.
INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, serving.name, serving.price, serving.ord, true, 'Serving choice', 'single', true, 1, 1, false
FROM public.menu_items item
JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('On its own',0,10),('With salad',100,20),('With chips and beans',200,30)) serving(name,price,ord)
WHERE category.name = 'Chef''s Specials' AND item.name IN ('Cheese Flan','Shepherds pie','Lasagne','Veg lasagne');

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, serving.name, serving.price, serving.ord, true, 'Serving choice', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('On its own',0,10),('With salad',100,20)) serving(name,price,ord)
WHERE category.name = 'Chef''s Specials' AND item.name = 'Chicken pasta';

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, side.name, 0, side.ord, true, 'Choose a side', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('Beans',10),('Peas',20),('Mushy peas',30)) side(name,ord)
WHERE category.name = 'Chef''s Specials' AND item.name = 'Fish & chips';

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, 'Add side salad', 100, 10, true, 'Extras', 'single', false, 0, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
WHERE category.name = 'Chef''s Specials' AND item.name IN ('Chicken Curry and Rice','Meat (lamb) Curry and Rice');

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, 'Add custard', 100, 10, true, 'Extras', 'single', false, 0, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
WHERE category.name = 'Desserts';

-- Savoury muffin inside sauce and optional hot drink.
INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, sauce.name, 0, sauce.ord, true, 'Sauce inside muffin', 'single', true, 1, 1, sauce.name = 'No sauce'
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Ketchup',10),('Brown sauce',20),('No sauce',30)) sauce(name,ord)
WHERE category.name = 'Savoury (English) Muffins';

INSERT INTO public.menu_modifiers (category_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT category.id, drink.name, 200, drink.ord, true, 'Add hot drink', 'single', false, 0, 1, false
FROM public.menu_categories category JOIN cafe1_target_site site ON category.site_id = site.id
CROSS JOIN (VALUES ('Americano',10),('Cappuccino',20),('English tea',30),('Latte',40),('Flat white',50),('Hot Chocolate',60)) drink(name,ord)
WHERE category.name = 'Savoury (English) Muffins';

-- Snack and speciality-tea flavours.
INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, flavour.name, 0, flavour.ord, true, 'Choose a flavour', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('Peppermint',10),('Spearmint',20),('Cool breeze',30),('Strawberry',40)) flavour(name,ord)
WHERE category.name = 'Snacks & Treats' AND item.name = 'Chewing gum';

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, flavour.name, 0, flavour.ord, true, 'Choose a flavour', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('Ready salted',10),('Cheese & onion',20),('Salt & vinegar',30),('Prawn cocktail',40)) flavour(name,ord)
WHERE category.name = 'Snacks & Treats' AND item.name = 'Walkers Crisps';

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, flavour.name, 0, flavour.ord, true, 'Choose a bar', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('Kit Kat chunky',10),('Snickers',20),('Aero mint',30),('Twix',40),('Kinder bueno',50)) flavour(name,ord)
WHERE category.name = 'Snacks & Treats' AND item.name = 'Chocolate bar';

INSERT INTO public.menu_modifiers (item_id,name,price_cents,sort_order,active,group_name,group_type,required,min_selections,max_selections,is_exclusive)
SELECT item.id, flavour.name, 0, flavour.ord, true, 'Choose a flavour', 'single', true, 1, 1, false
FROM public.menu_items item JOIN public.menu_categories category ON category.id = item.category_id
JOIN cafe1_target_site site ON item.site_id = site.id
CROSS JOIN (VALUES ('Lemon & ginger',10),('Peppermint',20),('Green tea',30),('Earl grey',40)) flavour(name,ord)
WHERE category.name = 'Speciality Tea' AND item.name = 'Speciality Tea';
