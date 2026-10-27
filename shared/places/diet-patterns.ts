// What a place's (or dish's) name, type and tags say about diet and allergens. No imports, so the
// generate-stories Edge Function (Deno) can use it as well as the API routes.
// AMap text is mostly Chinese; English is included for places that have it.
export const PATTERNS = {
  halal: /清真|halal|穆斯林|muslim|回民|兰州拉面|兰州牛肉面/i,
  pork: /猪|pork|叉烧|烧腊|腊肉|红烧肉|东坡肉|bacon|火腿|ham\b/i,
  alcohol: /酒吧|\bbar\b|\bpub\b|啤酒屋|精酿|brewery/i,
  vegetarian: /素食|素菜|斋菜|蔬食|vegetarian|vegan/i,
  meatCentric: /烤肉|烧烤|bbq|barbecue|牛排|steak|烤全羊|羊蝎子|烤鸭|roast duck|海鲜|seafood/i,
  beef: /牛肉|牛排|beef|steak/i,
  seafood: /海鲜|seafood|小龙虾|crayfish|蟹|crab|蚝|oyster/i,
  spicy: /川菜|湘菜|麻辣|火锅|hot ?pot|sichuan|hunan|重庆|贵州|spicy|辣/i,
} as const;

/** Places that specialise in an allergen (a menu can't be checked, a seafood house can). */
export const ALLERGEN_PATTERNS: { key: string; match: RegExp; place: RegExp }[] = [
  { key: 'shellfish', match: /shellfish|shrimp|crab|prawn|lobster|贝|虾|蟹/i, place: /海鲜|seafood|小龙虾|crayfish|虾|shrimp|蟹|crab|蚝|oyster/i },
  { key: 'fish', match: /^fish$|fish allergy|鱼/i, place: /海鲜|seafood|鱼|fish/i },
  { key: 'peanut', match: /peanut|花生/i, place: /花生|peanut/i },
  { key: 'tree-nut', match: /tree nut|nuts|坚果/i, place: /坚果|\bnuts?\b/i },
  { key: 'sesame', match: /sesame|芝麻/i, place: /芝麻|麻酱|sesame/i },
  { key: 'gluten', match: /gluten|wheat|celiac|coeliac|麸质/i, place: /面馆|拉面|noodle|面包|bakery|烘焙|包子|饺子|dumpling/i },
];
