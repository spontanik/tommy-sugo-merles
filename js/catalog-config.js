/* Shared by the public pages and /admin: which sections each brand has, and which price columns each section uses.
   The brands and sections tables hold the live version (sections are edited on the admin's Menu and Shop tabs). This is the fallback if they can't be read.
   priceLabels is the one part that isn't in the database.
   prices: "cd"     -> Collect / Deliver
           "single" -> one price */
window.CATALOG_CONFIG = {
  brands: {
    tommy: {
      label: "Tommy Sugo",
      page: "tommy-sugo.html",
      menu: [
        { key: "pizza-classics", title: "Pizza · The Classics", prices: "cd" },
        { key: "pizza-signatures", title: "Pizza · The Signatures", prices: "cd" },
        { key: "wrapped", title: "Wrapped Differently", prices: "single" },
        { key: "pasta-potjies", title: "Pasta & Potjies", prices: "single" },
        { key: "breakfast", title: "Breakfast", prices: "single" },
        { key: "sweet-stuff", title: "Sweet Stuff", prices: "single" },
        { key: "coffee", title: "Coffee", prices: "single" },
        { key: "cold-drinks", title: "Cold Drinks", prices: "single" }
      ],
      shop: [
        { key: "frozen-pizzas", title: "Frozen Pizzas" },
        { key: "the-sauce", title: "The Sauce" }
      ]
    },
    merles: {
      label: "Merle's Schnitz",
      page: "merles-schnitz.html",
      menu: [
        { key: "schnitz", title: "Schnitz", prices: "cd" },
        { key: "combos", title: "Combos", prices: "cd" },
        { key: "sides-sauces", title: "Sides & Sauces", prices: "cd" },
        { key: "milkshakes", title: "Milkshakes", prices: "cd" },
        { key: "sweet-treat", title: "Sweet Treat", prices: "cd" },
        { key: "drinks", title: "Drinks", prices: "cd" }
      ],
      shop: [
        { key: "frozen-schnitz", title: "Frozen Schnitz" },
        { key: "sauces", title: "Sauces" }
      ]
    }
  },
  priceLabels: {
    cd: [
      ["price", "Collect"],
      ["price_deliver", "Deliver"]
    ],
    single: [["price", "Price"]]
  }
};
