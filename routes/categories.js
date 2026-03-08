const express = require("express");
const catRouter = express.Router();

// Обработка конкретной категории
catRouter.get("/:id", function(req, res){
  let categoryId = parseInt(req.params.id);
  let categoryInfo = res.locals.data.categories.find(c => c.id === categoryId);

  if (!categoryInfo){
    res.status(404).render("not_found");
  };

  let products = res.locals.data.products.filter(p => p.category === categoryId);

  res.render("category", {
    category: categoryInfo,
    products: products
  });
});

// Обработка всех категорий
catRouter.get("/", function(req, res){
  res.render("categories", {
    categories: res.locals.data.categories
  });
});

module.exports = catRouter;