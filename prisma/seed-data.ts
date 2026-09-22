/**
 * Demo catalog.
 *
 * Every row this file produces is written with isDemo = true. None of it is a
 * factual claim about the client's stock, prices or availability — the client
 * has not supplied an assortment file, and will be entering the real catalog
 * themselves through the admin UI. The brands and fragrances below are the
 * houses a wholesale perfume warehouse in this trade actually resells, chosen
 * so that search, filtering and the "same fragrance, other formats" pivot are
 * exercised against realistic names rather than Lorem-like placeholders.
 */

import type { Family, Gender, StockState } from "@prisma/client";

export interface SeedFragrance {
  name: string;
  aliases: string[];
  gender: Gender;
  families: Family[];
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  description: string;
}

export interface SeedBrand {
  name: string;
  aliases: string[];
  fragrances: SeedFragrance[];
}

export const CATEGORIES = [
  {
    name: "Парфюм 35 мл «карандаши»",
    subtitle: "Компактный формат, удобно носить с собой",
    slug: "parfyum-35-ml",
    volumeMl: 35,
  },
  {
    name: "Парфюм 100 мл",
    subtitle: "Основной объём, полноразмерный флакон",
    slug: "parfyum-100-ml",
    volumeMl: 100,
  },
  {
    name: "Парфюм 2 в 1 «двойняшки» 100 мл",
    subtitle: "Два аромата в одном флаконе",
    slug: "dvoynyashki-100-ml",
    volumeMl: 100,
  },
  {
    name: "Дезодоранты 200 мл",
    subtitle: "Средства ухода, большой объём",
    slug: "dezodoranty-200-ml",
    volumeMl: 200,
  },
] as const;

export const BRANDS: SeedBrand[] = [
  {
    name: "Chanel",
    aliases: ["Шанель", "шанел", "chanell"],
    fragrances: [
      {
        name: "Coco Mademoiselle",
        aliases: ["Коко Мадемуазель", "коко мадмуазель"],
        gender: "FEMALE",
        families: ["ORIENTAL", "FLORAL"],
        notesTop: ["апельсин", "бергамот"],
        notesHeart: ["жасмин", "роза", "личи"],
        notesBase: ["пачули", "ваниль", "белый мускус"],
        description: "Тёплый восточно-цветочный аромат, один из самых востребованных в опте.",
      },
      {
        name: "Bleu de Chanel",
        aliases: ["Блю де Шанель", "блю шанель"],
        gender: "MALE",
        families: ["WOODY", "FRESH"],
        notesTop: ["грейпфрут", "лимон", "мята"],
        notesHeart: ["имбирь", "мускатный орех", "жасмин"],
        notesBase: ["кедр", "сандал", "ладан"],
        description: "Древесно-свежий мужской аромат, стабильный спрос круглый год.",
      },
      {
        name: "Chance Eau Tendre",
        aliases: ["Шанс О Тандр", "шанс тендер"],
        gender: "FEMALE",
        families: ["FLORAL", "FRESH"],
        notesTop: ["грейпфрут", "айва"],
        notesHeart: ["жасмин", "гиацинт"],
        notesBase: ["кедр", "белый мускус"],
        description: "Лёгкий цветочный, хорошо идёт в тёплое время года.",
      },
      {
        name: "Chanel №5",
        aliases: ["Шанель 5", "шанель номер 5", "chanel no 5"],
        gender: "FEMALE",
        families: ["FLORAL", "MUSK"],
        notesTop: ["альдегиды", "иланг-иланг", "нероли"],
        notesHeart: ["роза", "жасмин", "ирис"],
        notesBase: ["сандал", "ваниль", "ветивер"],
        description: "Классика, которую спрашивают по названию чаще любого другого аромата.",
      },
    ],
  },
  {
    name: "Dior",
    aliases: ["Диор", "кристиан диор", "christian dior"],
    fragrances: [
      {
        name: "Sauvage",
        aliases: ["Саваж", "соваж", "саваge"],
        gender: "MALE",
        families: ["FRESH", "SPICY"],
        notesTop: ["бергамот", "перец"],
        notesHeart: ["лаванда", "мускатный орех", "ваниль"],
        notesBase: ["амброксан", "кедр", "лабданум"],
        description: "Самый оборачиваемый мужской аромат в категории.",
      },
      {
        name: "J'adore",
        aliases: ["Жадор", "жадор диор"],
        gender: "FEMALE",
        families: ["FLORAL"],
        notesTop: ["груша", "дыня", "магнолия"],
        notesHeart: ["жасмин", "тубероза", "роза"],
        notesBase: ["мускус", "кедр", "ваниль"],
        description: "Цветочный бестселлер, берут на подарки.",
      },
      {
        name: "Miss Dior",
        aliases: ["Мисс Диор"],
        gender: "FEMALE",
        families: ["FLORAL", "CHYPRE"],
        notesTop: ["мандарин", "бергамот"],
        notesHeart: ["роза", "пион", "ландыш"],
        notesBase: ["пачули", "мускус"],
        description: "Шипрово-цветочный, узнаваемый силуэт флакона.",
      },
      {
        name: "Homme Intense",
        aliases: ["Ом Интенс", "диор ом"],
        gender: "MALE",
        families: ["WOODY", "GOURMAND"],
        notesTop: ["лаванда"],
        notesHeart: ["ирис", "амбретта"],
        notesBase: ["ветивер", "кедр"],
        description: "Ирисовый мужской, устойчивый нишевый спрос.",
      },
    ],
  },
  {
    name: "Lancôme",
    aliases: ["Ланком", "ланком"],
    fragrances: [
      {
        name: "La Vie Est Belle",
        aliases: ["Ла Ви Э Бель", "лави бель", "жизнь прекрасна"],
        gender: "FEMALE",
        families: ["GOURMAND", "FLORAL"],
        notesTop: ["чёрная смородина", "груша"],
        notesHeart: ["ирис", "жасмин", "апельсиновый цвет"],
        notesBase: ["пралине", "ваниль", "пачули"],
        description: "Сладкий гурманский, один из лидеров женской полки.",
      },
      {
        name: "Idôle",
        aliases: ["Идол", "идоль"],
        gender: "FEMALE",
        families: ["FLORAL", "CHYPRE"],
        notesTop: ["бергамот", "груша"],
        notesHeart: ["роза", "жасмин"],
        notesBase: ["ваниль", "белый мускус", "пачули"],
        description: "Чистый розово-мускусный, молодая аудитория.",
      },
      {
        name: "Trésor",
        aliases: ["Трезор"],
        gender: "FEMALE",
        families: ["FLORAL", "ORIENTAL"],
        notesTop: ["абрикос", "роза"],
        notesHeart: ["ирис", "гелиотроп"],
        notesBase: ["сандал", "ваниль"],
        description: "Классический пудровый, берут покупатели постарше.",
      },
      {
        name: "Miracle",
        aliases: ["Миракл", "чудо"],
        gender: "FEMALE",
        families: ["FLORAL", "SPICY"],
        notesTop: ["личи", "фрезия"],
        notesHeart: ["имбирь", "перец", "магнолия"],
        notesBase: ["жасмин", "мускус"],
        description: "Перечно-цветочный, долгоживущая позиция.",
      },
    ],
  },
  {
    name: "Hermès",
    aliases: ["Гермес", "эрмес", "эрме"],
    fragrances: [
      {
        name: "Terre d'Hermès",
        aliases: ["Терр Д'Эрмес", "терра гермес"],
        gender: "MALE",
        families: ["WOODY", "CITRUS"],
        notesTop: ["грейпфрут", "апельсин"],
        notesHeart: ["перец", "герань"],
        notesBase: ["ветивер", "кедр", "бензоин"],
        description: "Землисто-древесный, стабильная мужская классика.",
      },
      {
        name: "Twilly d'Hermès",
        aliases: ["Твилли"],
        gender: "FEMALE",
        families: ["FLORAL", "SPICY"],
        notesTop: ["имбирь"],
        notesHeart: ["тубероза"],
        notesBase: ["сандал"],
        description: "Имбирно-туберозовый, яркий и узнаваемый.",
      },
      {
        name: "Un Jardin sur le Nil",
        aliases: ["Ан Жарден сюр ле Ниль", "сад на ниле"],
        gender: "UNISEX",
        families: ["CITRUS", "WOODY"],
        notesTop: ["зелёное манго", "грейпфрут"],
        notesHeart: ["лотос", "апельсин"],
        notesBase: ["ладан", "кедр"],
        description: "Зелёный цитрусовый унисекс, спрашивают оба пола.",
      },
      {
        name: "H24",
        aliases: ["Аш 24", "н24"],
        gender: "MALE",
        families: ["FRESH", "WOODY"],
        notesTop: ["шалфей"],
        notesHeart: ["нарцисс", "розовый перец"],
        notesBase: ["сандал"],
        description: "Современный свежий древесный, новинка линейки.",
      },
    ],
  },
  {
    name: "Versace",
    aliases: ["Версаче", "версачи"],
    fragrances: [
      {
        name: "Eros",
        aliases: ["Эрос"],
        gender: "MALE",
        families: ["AQUATIC", "GOURMAND"],
        notesTop: ["мята", "зелёное яблоко", "лимон"],
        notesHeart: ["тонка", "герань", "амброксан"],
        notesBase: ["ваниль", "кедр", "дубовый мох"],
        description: "Сладко-свежий, очень ходовой в среднем сегменте.",
      },
      {
        name: "Bright Crystal",
        aliases: ["Брайт Кристал", "кристал"],
        gender: "FEMALE",
        families: ["FLORAL", "FRESH"],
        notesTop: ["гранат", "юзу"],
        notesHeart: ["пион", "магнолия", "лотос"],
        notesBase: ["амбра", "мускус", "красное дерево"],
        description: "Лёгкий фруктово-цветочный, хорошо продаётся летом.",
      },
      {
        name: "Dylan Blue",
        aliases: ["Дилан Блю"],
        gender: "MALE",
        families: ["AQUATIC", "WOODY"],
        notesTop: ["бергамот", "грейпфрут"],
        notesHeart: ["фиалка", "чёрный перец"],
        notesBase: ["мускус", "пачули", "тонка"],
        description: "Водно-древесный, повседневный вариант.",
      },
      {
        name: "Crystal Noir",
        aliases: ["Кристал Нуар", "черный кристалл"],
        gender: "FEMALE",
        families: ["ORIENTAL", "FLORAL"],
        notesTop: ["перец", "кардамон"],
        notesHeart: ["гардения", "кокос"],
        notesBase: ["сандал", "амбра", "мускус"],
        description: "Тёмный восточный, вечерний вариант к Bright Crystal.",
      },
    ],
  },
  {
    name: "Giorgio Armani",
    aliases: ["Армани", "джорджио армани", "armani"],
    fragrances: [
      {
        name: "Acqua di Gio",
        aliases: ["Аква ди Джио", "аква джио"],
        gender: "MALE",
        families: ["AQUATIC", "CITRUS"],
        notesTop: ["лимон", "бергамот", "жасмин"],
        notesHeart: ["морская нота", "розмарин"],
        notesBase: ["пачули", "белый мускус", "кедр"],
        description: "Морской цитрус, один из самых узнаваемых мужских.",
      },
      {
        name: "Si",
        aliases: ["Си", "си армани"],
        gender: "FEMALE",
        families: ["CHYPRE", "GOURMAND"],
        notesTop: ["чёрная смородина"],
        notesHeart: ["роза", "фрезия"],
        notesBase: ["ваниль", "пачули", "амбра"],
        description: "Шипрово-гурманский, стабильный женский спрос.",
      },
      {
        name: "Stronger With You",
        aliases: ["Стронгер виз ю", "стронгер"],
        gender: "MALE",
        families: ["GOURMAND", "SPICY"],
        notesTop: ["кардамон", "розовый перец"],
        notesHeart: ["шалфей", "лаванда"],
        notesBase: ["каштан", "ваниль", "амбра"],
        description: "Сладко-пряный, очень востребован у молодой аудитории.",
      },
      {
        name: "My Way",
        aliases: ["Май Вэй", "мой путь"],
        gender: "FEMALE",
        families: ["FLORAL", "MUSK"],
        notesTop: ["апельсиновый цвет", "бергамот"],
        notesHeart: ["тубероза", "жасмин"],
        notesBase: ["ваниль", "белый мускус", "кедр"],
        description: "Белоцветочный мускусный, растущий спрос.",
      },
    ],
  },
  {
    name: "Yves Saint Laurent",
    aliases: ["Ив Сен Лоран", "ysl", "сен лоран"],
    fragrances: [
      {
        name: "Black Opium",
        aliases: ["Блэк Опиум", "опиум"],
        gender: "FEMALE",
        families: ["GOURMAND", "ORIENTAL"],
        notesTop: ["груша", "розовый перец"],
        notesHeart: ["кофе", "жасмин"],
        notesBase: ["ваниль", "пачули", "кедр"],
        description: "Кофейно-ванильный, один из лидеров продаж.",
      },
      {
        name: "Libre",
        aliases: ["Либре"],
        gender: "FEMALE",
        families: ["FOUGERE", "FLORAL"],
        notesTop: ["мандарин", "лаванда"],
        notesHeart: ["жасмин", "апельсиновый цвет"],
        notesBase: ["ваниль", "кедр", "мускус"],
        description: "Лавандово-ванильный, современная классика.",
      },
      {
        name: "Y Eau de Parfum",
        aliases: ["Игрек", "y ysl"],
        gender: "MALE",
        families: ["FRESH", "WOODY"],
        notesTop: ["яблоко", "имбирь", "бергамот"],
        notesHeart: ["шалфей", "герань"],
        notesBase: ["кедр", "ваниль", "амбра"],
        description: "Свежий древесный, хорошо берут в подарок.",
      },
    ],
  },
  {
    name: "Paco Rabanne",
    aliases: ["Пако Рабан", "пако рабанн", "рабан"],
    fragrances: [
      {
        name: "1 Million",
        aliases: ["Один миллион", "1 миллион", "миллион"],
        gender: "MALE",
        families: ["SPICY", "LEATHER"],
        notesTop: ["грейпфрут", "мята", "мандарин"],
        notesHeart: ["корица", "роза", "пряные ноты"],
        notesBase: ["кожа", "амбра", "пачули"],
        description: "Пряно-кожаный, узнаваемый флакон-слиток.",
      },
      {
        name: "Lady Million",
        aliases: ["Леди Миллион"],
        gender: "FEMALE",
        families: ["FLORAL", "ORIENTAL"],
        notesTop: ["лимон", "малина", "нероли"],
        notesHeart: ["жасмин", "гардения", "апельсиновый цвет"],
        notesBase: ["мёд", "пачули", "амбра"],
        description: "Медово-цветочный, парный к мужскому 1 Million.",
      },
      {
        name: "Invictus",
        aliases: ["Инвиктус"],
        gender: "MALE",
        families: ["AQUATIC", "WOODY"],
        notesTop: ["грейпфрут", "морская нота"],
        notesHeart: ["лавровый лист", "жасмин"],
        notesBase: ["амбра", "гваяк", "пачули"],
        description: "Свежий спортивный, высокий оборот летом.",
      },
    ],
  },
];

/** Deodorants are sold under the same houses but are not fragrance-led. */
export const DEODORANT_BASES = [
  { brand: "Versace", fragrance: "Eros" },
  { brand: "Giorgio Armani", fragrance: "Acqua di Gio" },
  { brand: "Paco Rabanne", fragrance: "1 Million" },
  { brand: "Dior", fragrance: "Sauvage" },
  { brand: "Chanel", fragrance: "Bleu de Chanel" },
  { brand: "Yves Saint Laurent", fragrance: "Black Opium" },
  { brand: "Lancôme", fragrance: "La Vie Est Belle" },
  { brand: "Versace", fragrance: "Bright Crystal" },
] as const;

/** Pairings for the "twins" category — one bottle, two fragrances. */
export const TWIN_PAIRS = [
  [["Chanel", "Coco Mademoiselle"], ["Chanel", "Chance Eau Tendre"]],
  [["Dior", "Sauvage"], ["Dior", "Homme Intense"]],
  [["Versace", "Eros"], ["Versace", "Dylan Blue"]],
  [["Paco Rabanne", "1 Million"], ["Paco Rabanne", "Lady Million"]],
  [["Giorgio Armani", "Acqua di Gio"], ["Giorgio Armani", "Stronger With You"]],
  [["Yves Saint Laurent", "Black Opium"], ["Yves Saint Laurent", "Libre"]],
  [["Lancôme", "La Vie Est Belle"], ["Lancôme", "Idôle"]],
  [["Chanel", "Bleu de Chanel"], ["Dior", "Sauvage"]],
  [["Hermès", "Terre d'Hermès"], ["Hermès", "Twilly d'Hermès"]],
  [["Dior", "J'adore"], ["Dior", "Miss Dior"]],
] as const;

export const STOCK_CYCLE: StockState[] = [
  "IN_STOCK", "IN_STOCK", "IN_STOCK", "IN_STOCK",
  "LOW", "IN_STOCK", "IN_STOCK", "PREORDER", "IN_STOCK", "OUT",
];
